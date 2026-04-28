import { db } from "@/db";
import { events, sources, interactions, preferenceProfile, geocodeCache, scrapeRuns } from "@/db/schema";
import { eq, and, lt, count, desc, inArray } from "drizzle-orm";
import { extractEventsFromHtml, extractEventsViaWebSearch, type ExtractedEvent } from "@/lib/claude/extract-events";
import { scoreEvents } from "@/lib/claude/score-events";
import { filterDuplicates } from "@/lib/claude/deduplicate";
import { regenerateProfile } from "@/lib/claude/update-profile";
import { geocodeAddress, computeDistanceMiles } from "@/lib/geocoding";
import { mergeExistingEvents } from "@/lib/scraper/merge-events";

export async function runScrapeCycle() {
  console.log(`[scraper] Starting scrape cycle at ${new Date().toISOString()}`);

  // Step 1: Clean up expired events (older than 7 days past).
  // Delete dependent interactions first to satisfy FK constraint.
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

  // Step 2: Update preference profile if new interactions exist
  await maybeUpdateProfile();

  // Step 3: Fetch events from all enabled sources (bounded concurrency)
  const enabledSources = await db.select().from(sources).where(eq(sources.enabled, 1));
  const allNewEvents: Array<ExtractedEvent & { sourceName: string }> = [];
  const CONCURRENCY = parseInt(process.env.SF_EVENTS_SCRAPE_CONCURRENCY ?? "3", 10);

  type Source = (typeof enabledSources)[number];
  const scrapeOne = async (source: Source) => {
    const startedAt = new Date();
    let extracted: ExtractedEvent[] = [];
    let status: "success" | "error" | "empty" = "success";
    let errorMessage: string | null = null;

    try {
      if (source.type === "venue" && source.url) {
        // Try direct HTML fetch first
        const res = await fetch(source.url, {
          headers: { "User-Agent": "sf-events-dashboard/1.0" },
        });
        if (res.ok) {
          const html = await res.text();
          extracted = await extractEventsFromHtml(html, source.name);
        }

        // Fall back to web search if HTML extraction yielded nothing
        if (extracted.length === 0) {
          extracted = await extractEventsViaWebSearch(
            `upcoming events at ${source.name} San Francisco`,
            source.name
          );
        }
      } else if (source.type === "platform" && source.searchQuery) {
        extracted = await extractEventsViaWebSearch(source.searchQuery, source.name);
      }

      const tagged = extracted.map((e) => ({ ...e, sourceName: source.name }));
      allNewEvents.push(...tagged);

      if (extracted.length === 0) status = "empty";
      console.log(`[scraper] ${source.name}: found ${extracted.length} events`);
    } catch (err) {
      status = "error";
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] Error scraping ${source.name}:`, err);
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    try {
      await db.insert(scrapeRuns).values({
        sourceId: source.id,
        status,
        eventsFound: extracted.length,
        errorMessage,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
      });
      await db
        .update(sources)
        .set({ lastScrapedAt: finishedAt.toISOString() })
        .where(eq(sources.id, source.id));
    } catch (err) {
      console.error(`[scraper] Failed to log run for ${source.name}:`, err);
    }
  };

  // Simple worker-pool: drain sources queue with N parallel workers
  const queue = [...enabledSources];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      await scrapeOne(next);
    }
  });
  await Promise.all(workers);

  if (allNewEvents.length === 0) {
    console.log("[scraper] No events found this cycle.");
    return;
  }

  // Step 4: Deduplicate against existing events
  const existingEvents = await db
    .select({ title: events.title, venue: events.venue })
    .from(events);

  const uniqueEvents = await filterDuplicates(allNewEvents, existingEvents);
  console.log(`[scraper] ${uniqueEvents.length} new events after dedup (from ${allNewEvents.length} total)`);

  if (uniqueEvents.length === 0) return;

  // Step 5: Score events
  const profile = await db
    .select()
    .from(preferenceProfile)
    .orderBy(desc(preferenceProfile.version))
    .limit(1);

  const profileText = profile[0]?.profileText ?? "";
  const scores = await scoreEvents(uniqueEvents, profileText);

  // Step 6: Geocode and insert events
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

      const scoreKey = `${event.title}|${event.date}|${event.venue}`;
      const relevanceScore = scores.get(scoreKey) ?? null;

      const expiresAt = new Date(event.date);
      expiresAt.setDate(expiresAt.getDate() + 1);

      await db
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
          source: (event as ExtractedEvent & { sourceName: string }).sourceName,
          relevanceScore,
          createdAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
        })
        .onConflictDoNothing();
    } catch (err) {
      console.error(`[scraper] Error inserting event "${event.title}":`, err);
    }
  }

  // Step 7: Merge duplicate events in the database
  await mergeExistingEvents();

  console.log(`[scraper] Scrape cycle complete.`);
}

async function maybeUpdateProfile() {
  const latestProfile = await db
    .select()
    .from(preferenceProfile)
    .orderBy(desc(preferenceProfile.version))
    .limit(1);

  if (!latestProfile[0]) return;

  const lastProfileDate = latestProfile[0].createdAt;

  // Check if any interactions are newer than the last profile update
  const newestInteraction = await db
    .select({ createdAt: interactions.createdAt })
    .from(interactions)
    .orderBy(desc(interactions.createdAt))
    .limit(1);

  if (!newestInteraction[0] || newestInteraction[0].createdAt <= lastProfileDate) {
    return; // No new interactions since last profile update
  }

  // Get all interactions for profile regeneration
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

  const newProfileText = await regenerateProfile(
    latestProfile[0].profileText,
    allInteractions
  );

  await db.insert(preferenceProfile).values({
    profileText: newProfileText,
    version: latestProfile[0].version + 1,
    createdAt: new Date().toISOString(),
  });

  console.log(`[scraper] Updated preference profile to version ${latestProfile[0].version + 1}`);
}
