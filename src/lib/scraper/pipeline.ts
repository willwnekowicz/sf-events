import { db } from "@/db";
import {
  events,
  sources,
  interactions,
  preferenceProfile,
  scrapeRuns,
  scrapeJobs,
  scrapeRunEvents,
  scrapeBdCalls,
} from "@/db/schema";
import { eq, lt, desc, inArray, sql } from "drizzle-orm";
import { extractEventsFromHtml, type ExtractedEvent } from "@/lib/claude/extract-events";
import { scoreEvents } from "@/lib/claude/score-events";
import { filterDuplicates } from "@/lib/claude/deduplicate";
import { regenerateProfile } from "@/lib/claude/update-profile";
import { geocodeAddress, computeDistanceMiles } from "@/lib/geocoding";
import { mergeExistingEvents } from "@/lib/scraper/merge-events";
import { unlock, search, fetchRenderedHtml, facebookEvents, type BdCall } from "@/lib/brightdata";
import { fetchDirect, looksUsable } from "@/lib/scraper/direct-fetch";
import { htmlToText } from "@/lib/scraper/html-to-text";
import { maybeCallAboutEvent, callThreshold, type CallableEvent } from "@/lib/livekit/notify";

type Source = typeof sources.$inferSelect;
type TaggedEvent = ExtractedEvent & { sourceName: string; runId: number; runEventId: number };

const SERP_FOLLOW = parseInt(process.env.SF_EVENTS_SERP_FOLLOW ?? "3", 10);
const PER_PAGE_BUDGET = 25_000; // chars of cleaned text per followed page (3 × ≈ under the extractor budget)

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

let activeJobId: number | null = null;

/** True while a scrape cycle is in flight (in this process). */
export function isScrapeRunning(): boolean {
  return activeJobId !== null;
}

/**
 * Create a job row, kick off the cycle in the background, and return the jobId
 * immediately so the UI can poll for live progress. Runs in-process (this app is
 * a long-lived Node server, not serverless).
 */
export async function startScrapeJob(trigger: "manual" | "cron"): Promise<number> {
  if (activeJobId !== null) return activeJobId;

  const enabled = await db.select({ id: sources.id }).from(sources).where(eq(sources.enabled, 1));
  const [job] = await db
    .insert(scrapeJobs)
    .values({
      trigger,
      status: "running",
      startedAt: new Date().toISOString(),
      totalSources: enabled.length,
    })
    .returning({ id: scrapeJobs.id });

  activeJobId = job.id;
  // Fire and forget — runJob owns lifecycle + clearing activeJobId.
  void runJob(job.id).catch((err) => {
    console.error("[scraper] job crashed:", err);
  });
  return job.id;
}

/** Backwards-compatible entry used by the cron scheduler. */
export async function runScrapeCycle(): Promise<void> {
  await startScrapeJob("cron");
}

// ---------------------------------------------------------------------------
// Telemetry helpers
// ---------------------------------------------------------------------------

async function recordBdCall(jobId: number, runId: number, c: BdCall) {
  await db.insert(scrapeBdCalls).values({
    jobId,
    runId,
    product: c.product,
    operation: c.operation,
    url: c.url,
    httpStatus: c.httpStatus,
    bytes: c.bytes,
    credits: c.credits,
    costUsd: c.costUsd,
    durationMs: c.durationMs,
    ok: c.ok ? 1 : 0,
    errorMessage: c.errorMessage,
    createdAt: new Date().toISOString(),
  });
}

async function setStage(runId: number, stage: string) {
  await db.update(scrapeRuns).set({ stage }).where(eq(scrapeRuns.id, runId));
}

async function bumpJob(jobId: number, delta: Partial<Record<"completedSources" | "totalFound" | "totalInserted" | "totalErrors", number>> & { credits?: number; costUsd?: number }) {
  const set: Record<string, unknown> = {};
  if (delta.completedSources) set.completedSources = sql`${scrapeJobs.completedSources} + ${delta.completedSources}`;
  if (delta.totalFound) set.totalFound = sql`${scrapeJobs.totalFound} + ${delta.totalFound}`;
  if (delta.totalInserted) set.totalInserted = sql`${scrapeJobs.totalInserted} + ${delta.totalInserted}`;
  if (delta.totalErrors) set.totalErrors = sql`${scrapeJobs.totalErrors} + ${delta.totalErrors}`;
  if (delta.credits) set.totalCredits = sql`${scrapeJobs.totalCredits} + ${delta.credits}`;
  if (delta.costUsd) set.totalCostUsd = sql`${scrapeJobs.totalCostUsd} + ${delta.costUsd}`;
  if (Object.keys(set).length === 0) return;
  await db.update(scrapeJobs).set(set).where(eq(scrapeJobs.id, jobId));
}

// ---------------------------------------------------------------------------
// Fetch strategies (which Bright Data product handles a source)
// ---------------------------------------------------------------------------

/** Resolve the page URL for a source (handles URL stuffed into searchQuery). */
function sourceTargetUrl(source: Source): string | null {
  if (source.url) return source.url;
  const q = source.searchQuery?.trim();
  if (q && /^https?:\/\//i.test(q)) return q;
  return null;
}

/** Map Bright Data Facebook "Events" dataset records to our event shape. */
function mapFacebookRecords(records: Array<Record<string, unknown>>): ExtractedEvent[] {
  const str = (v: unknown): string | null => (v == null ? null : String(v));
  return records
    .map((r) => {
      const title = str(r.name ?? r.title ?? r.event_name);
      const rawDate = str(r.start_date ?? r.date ?? r.event_date ?? r.start_time);
      if (!title || !rawDate) return null;
      const date = rawDate.slice(0, 10);
      return {
        title,
        date,
        time: str(r.start_time ?? r.time),
        venue: str(r.venue ?? r.location ?? r.place ?? "Facebook") ?? "Facebook",
        address: str(r.address ?? r.full_address),
        description: str(r.description ?? r.details),
        price: str(r.price ?? r.ticket_price),
        url: str(r.url ?? r.event_url ?? r.link),
        imageUrl: str(r.image ?? r.image_url ?? r.cover_image),
      } satisfies ExtractedEvent;
    })
    .filter((e): e is ExtractedEvent => e !== null);
}

interface FetchOutcome {
  extracted: ExtractedEvent[];
  calls: BdCall[];
  content: string;
  httpStatus: number | null;
  error: string | null;
}

/**
 * Fetch + extract for one source. NEVER throws — collected Bright Data calls and
 * any error are always returned so telemetry survives failures (a failed call
 * must still be recorded for the cost monitor and diagnostics).
 */
async function fetchSource(source: Source, runId: number): Promise<FetchOutcome> {
  const calls: BdCall[] = [];
  let extracted: ExtractedEvent[] = [];
  let content = "";
  let httpStatus: number | null = null;
  let error: string | null = null;
  const method = source.method ?? (sourceTargetUrl(source) ? "web_unlocker" : "serp");

  try {
    switch (method) {
      case "web_unlocker": {
        const url = sourceTargetUrl(source);
        if (!url) throw new Error("web_unlocker source has no URL configured");
        // Most venue/listing pages aren't bot-protected — try a free direct
        // fetch first and only spend a Web Unlocker call if it's blocked/thin.
        await setStage(runId, "fetching");
        const direct = await fetchDirect(url);
        calls.push(direct.call);
        httpStatus = direct.call.httpStatus;
        if (direct.call.ok && looksUsable(direct.content)) {
          content = direct.content;
        } else {
          await setStage(runId, "unlocking");
          const r = await unlock(url);
          calls.push(r.call);
          httpStatus = r.call.httpStatus;
          if (!r.call.ok) throw new Error(r.call.errorMessage ?? "Web Unlocker failed");
          content = r.content;
        }
        await setStage(runId, "extracting");
        extracted = await extractEventsFromHtml(content, source.name);
        break;
      }

      case "serp": {
        await setStage(runId, "searching");
        const s = await search(source.searchQuery ?? `${source.name} San Francisco events`, { num: 12 });
        calls.push(s.call);
        httpStatus = s.call.httpStatus;
        if (!s.call.ok) throw new Error(s.call.errorMessage ?? "SERP search failed");

        await setStage(runId, "unlocking");
        const pages: string[] = [];
        for (const res of s.results.slice(0, SERP_FOLLOW)) {
          const u = await unlock(res.url);
          calls.push(u.call);
          if (u.call.ok && u.content) {
            // Clean to text BEFORE the per-page cap, so the budget holds event
            // content instead of <head>/script boilerplate.
            const text = htmlToText(u.content);
            pages.push(`SOURCE URL: ${res.url}\n${text.slice(0, PER_PAGE_BUDGET)}`);
          }
        }
        const fallback = s.results.map((r) => `${r.title}\n${r.url}\n${r.snippet ?? ""}`).join("\n\n");
        content = pages.length > 0 ? pages.join("\n\n---\n\n") : fallback;
        if (!content.trim()) throw new Error("SERP returned no usable results");

        await setStage(runId, "extracting");
        extracted = await extractEventsFromHtml(content, source.name);
        break;
      }

      case "scraping_browser": {
        const url = sourceTargetUrl(source);
        if (!url) throw new Error("scraping_browser source has no URL configured");
        await setStage(runId, "rendering");
        const r = await fetchRenderedHtml(url, { scroll: true });
        calls.push(r.call);
        httpStatus = r.call.httpStatus;
        if (!r.call.ok) throw new Error(r.call.errorMessage ?? "Scraping Browser failed");
        content = r.content;
        await setStage(runId, "extracting");
        extracted = await extractEventsFromHtml(r.content, source.name);
        break;
      }

      case "web_data_facebook_events": {
        const url = sourceTargetUrl(source);
        if (!url) throw new Error("web_data source has no URL configured");
        await setStage(runId, "collecting");
        const r = await facebookEvents(url);
        calls.push(r.call);
        httpStatus = r.call.httpStatus;
        if (!r.call.ok) throw new Error(r.call.errorMessage ?? "Web Data collection failed");
        content = JSON.stringify(r.records).slice(0, 20_000);
        extracted = mapFacebookRecords(r.records); // structured — no LLM
        break;
      }

      default:
        throw new Error(`Unknown scrape method: ${method}`);
    }
  } catch (e) {
    error = errMsg(e);
  }

  return { extracted, calls, content, httpStatus, error };
}

// ---------------------------------------------------------------------------
// Per-source run
// ---------------------------------------------------------------------------

async function scrapeOne(source: Source, jobId: number): Promise<TaggedEvent[]> {
  const startedAt = new Date();
  const [run] = await db
    .insert(scrapeRuns)
    .values({
      jobId,
      sourceId: source.id,
      status: "running",
      method: source.method,
      stage: "starting",
      startedAt: startedAt.toISOString(),
    })
    .returning({ id: scrapeRuns.id });
  const runId = run.id;

  let status: "success" | "error" | "empty" = "success";
  let errorMessage: string | null = null;

  // fetchSource never throws — it always returns its collected BD calls + error.
  const outcome = await fetchSource(source, runId);
  const { extracted, calls, content, httpStatus } = outcome;
  if (outcome.error) {
    status = "error";
    errorMessage = outcome.error;
    console.error(`[scraper] ${source.name} (${source.method}) error:`, errorMessage);
  } else if (extracted.length === 0) {
    status = "empty";
  }
  if (!outcome.error) console.log(`[scraper] ${source.name} (${source.method}): ${extracted.length} events`);

  // Persist Bright Data call audit trail.
  for (const c of calls) await recordBdCall(jobId, runId, c);

  // Persist the events this run surfaced (status starts as 'extracted').
  const runEventIds: number[] = [];
  for (const e of extracted) {
    const [re] = await db
      .insert(scrapeRunEvents)
      .values({ runId, jobId, title: e.title, url: e.url, date: e.date, venue: e.venue, status: "extracted" })
      .returning({ id: scrapeRunEvents.id });
    runEventIds.push(re.id);
  }

  const credits = calls.reduce((s, c) => s + c.credits, 0);
  const costUsd = calls.reduce((s, c) => s + c.costUsd, 0);
  const finishedAt = new Date();
  await db
    .update(scrapeRuns)
    .set({
      status,
      stage: null,
      eventsFound: extracted.length,
      extractedCount: extracted.length,
      httpStatus,
      contentBytes: content ? Buffer.byteLength(content) : null,
      costCredits: credits,
      costUsd,
      errorMessage,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    })
    .where(eq(scrapeRuns.id, runId));

  await bumpJob(jobId, {
    completedSources: 1,
    totalFound: extracted.length,
    totalErrors: status === "error" ? 1 : 0,
    credits,
    costUsd,
  });
  await db.update(sources).set({ lastScrapedAt: finishedAt.toISOString() }).where(eq(sources.id, source.id));

  return extracted.map((e, i) => ({ ...e, sourceName: source.name, runId, runEventId: runEventIds[i] }));
}

// ---------------------------------------------------------------------------
// Full cycle
// ---------------------------------------------------------------------------

async function runJob(jobId: number): Promise<void> {
  try {
    console.log(`[scraper] job ${jobId} starting at ${new Date().toISOString()}`);

    // 1. Clean up expired events (older than 7 days past).
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const expiredEvents = await db
      .select({ id: events.id })
      .from(events)
      .where(lt(events.expiresAt, sevenDaysAgo.toISOString()));
    if (expiredEvents.length > 0) {
      const ids = expiredEvents.map((e) => e.id);
      await db.delete(interactions).where(inArray(interactions.eventId, ids));
      await db.delete(events).where(inArray(events.id, ids));
    }

    // 2. Update preference profile if new interactions exist.
    await maybeUpdateProfile();

    // 3. Fetch from all enabled sources (bounded concurrency).
    const enabledSources = await db.select().from(sources).where(eq(sources.enabled, 1));
    const CONCURRENCY = parseInt(process.env.SF_EVENTS_SCRAPE_CONCURRENCY ?? "3", 10);
    const collected: TaggedEvent[] = [];

    const queue = [...enabledSources];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        const tagged = await scrapeOne(next, jobId);
        collected.push(...tagged);
      }
    });
    await Promise.all(workers);

    if (collected.length > 0) {
      // 4. Deduplicate against existing events, attributing drops back to runs.
      const existingEvents = await db.select({ title: events.title, venue: events.venue }).from(events);
      const uniqueEvents = (await filterDuplicates(collected, existingEvents)) as TaggedEvent[];
      const keptIds = new Set(uniqueEvents.map((e) => e.runEventId));
      for (const e of collected) {
        if (!keptIds.has(e.runEventId)) {
          await db.update(scrapeRunEvents).set({ status: "duplicate" }).where(eq(scrapeRunEvents.id, e.runEventId));
          await db.update(scrapeRuns).set({ dedupedCount: sql`${scrapeRuns.dedupedCount} + 1` }).where(eq(scrapeRuns.id, e.runId));
        }
      }

      // 5. Score.
      const profile = await db
        .select()
        .from(preferenceProfile)
        .orderBy(desc(preferenceProfile.version))
        .limit(1);
      const scores = await scoreEvents(uniqueEvents, profile[0]?.profileText ?? "");

      // 6. Geocode + insert, attributing inserts/duplicates back to runs.
      const hotCandidates: CallableEvent[] = [];
      for (const event of uniqueEvents) {
        try {
          let lat: number | null = null;
          let lng: number | null = null;
          let distanceMiles: number | null = null;
          if (event.address) {
            const coords = await geocodeAddress(event.address);
            if (coords) {
              lat = coords.lat;
              lng = coords.lng;
              distanceMiles = computeDistanceMiles(lat, lng);
            }
          }
          const relevanceScore = scores.get(`${event.title}|${event.date}|${event.venue}`) ?? null;
          const expiresAt = new Date(event.date);
          expiresAt.setDate(expiresAt.getDate() + 1);

          const res = await db
            .insert(events)
            .values({
              title: event.title,
              date: event.date,
              time: event.time,
              venue: event.venue,
              address: event.address,
              lat,
              lng,
              distanceMiles,
              description: event.description,
              price: event.price,
              url: event.url,
              imageUrl: event.imageUrl,
              source: event.sourceName,
              relevanceScore,
              createdAt: new Date().toISOString(),
              expiresAt: expiresAt.toISOString(),
            })
            .onConflictDoNothing();

          const result = res as unknown as { changes: number; lastInsertRowid: number | bigint };
          const inserted = result.changes > 0;
          await db
            .update(scrapeRunEvents)
            .set({ status: inserted ? "inserted" : "duplicate" })
            .where(eq(scrapeRunEvents.id, event.runEventId));
          if (inserted) {
            await db.update(scrapeRuns).set({ insertedCount: sql`${scrapeRuns.insertedCount} + 1` }).where(eq(scrapeRuns.id, event.runId));
            await bumpJob(jobId, { totalInserted: 1 });
            // Collect hot events to call about (highest-scoring one fires after the cycle).
            if (relevanceScore != null && relevanceScore >= callThreshold()) {
              hotCandidates.push({
                id: Number(result.lastInsertRowid),
                title: event.title,
                venue: event.venue,
                date: event.date,
                time: event.time,
                description: event.description,
                price: event.price,
                relevanceScore,
              });
            }
          } else {
            await db.update(scrapeRuns).set({ dedupedCount: sql`${scrapeRuns.dedupedCount} + 1` }).where(eq(scrapeRuns.id, event.runId));
          }
        } catch (err) {
          console.error(`[scraper] insert error for "${event.title}":`, err);
        }
      }

      // 7. Merge duplicate events in the database.
      await mergeExistingEvents();

      // 8. React to live data: call the user about the single hottest new event.
      if (hotCandidates.length > 0) {
        const top = hotCandidates.reduce((a, b) =>
          (b.relevanceScore ?? 0) > (a.relevanceScore ?? 0) ? b : a
        );
        try {
          await maybeCallAboutEvent(top);
        } catch (err) {
          console.error("[scraper] call trigger failed:", err);
        }
      }
    }

    await db
      .update(scrapeJobs)
      .set({ status: "done", finishedAt: new Date().toISOString() })
      .where(eq(scrapeJobs.id, jobId));
    console.log(`[scraper] job ${jobId} complete.`);
  } catch (err) {
    await db
      .update(scrapeJobs)
      .set({ status: "error", finishedAt: new Date().toISOString(), errorMessage: errMsg(err) })
      .where(eq(scrapeJobs.id, jobId));
    console.error(`[scraper] job ${jobId} failed:`, err);
  } finally {
    activeJobId = null;
  }
}

// ---------------------------------------------------------------------------
// Profile maintenance (unchanged behavior)
// ---------------------------------------------------------------------------

async function maybeUpdateProfile() {
  const latestProfile = await db
    .select()
    .from(preferenceProfile)
    .orderBy(desc(preferenceProfile.version))
    .limit(1);
  if (!latestProfile[0]) return;

  const lastProfileDate = latestProfile[0].createdAt;
  const newestInteraction = await db
    .select({ createdAt: interactions.createdAt })
    .from(interactions)
    .orderBy(desc(interactions.createdAt))
    .limit(1);
  if (!newestInteraction[0] || newestInteraction[0].createdAt <= lastProfileDate) return;

  const allInteractions = await db
    .select({
      action: interactions.action,
      eventTitle: events.title,
      eventDescription: events.description,
      eventVenue: events.venue,
      note: interactions.note,
    })
    .from(interactions)
    .innerJoin(events, eq(interactions.eventId, events.id));

  const newProfileText = await regenerateProfile(latestProfile[0].profileText, allInteractions);
  await db.insert(preferenceProfile).values({
    profileText: newProfileText,
    version: latestProfile[0].version + 1,
    createdAt: new Date().toISOString(),
  });
  console.log(`[scraper] Updated preference profile to v${latestProfile[0].version + 1}`);
}
