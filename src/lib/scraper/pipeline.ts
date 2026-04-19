import { db } from "@/db";
import { events, sources, interactions, preferenceProfile, geocodeCache } from "@/db/schema";
import { eq, and, lt, count, desc } from "drizzle-orm";
import { extractEventsFromHtml, extractEventsViaWebSearch, type ExtractedEvent } from "@/lib/claude/extract-events";
import { scoreEvents } from "@/lib/claude/score-events";
import { filterDuplicates } from "@/lib/claude/deduplicate";
import { regenerateProfile } from "@/lib/claude/update-profile";
import { geocodeAddress, computeDistanceMiles } from "@/lib/geocoding";
import { mergeExistingEvents } from "@/lib/scraper/merge-events";

export async function runScrapeCycle() {
  console.log(`[scraper] Starting scrape cycle at ${new Date().toISOString()}`);

  // Step 1: Clean up expired events (older than 7 days past)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  await db.delete(events).where(lt(events.expiresAt, sevenDaysAgo.toISOString()));

  // Step 2: Update preference profile if new interactions exist
  await maybeUpdateProfile();

  // Step 3: Fetch events from all enabled sources
  const enabledSources = await db.select().from(sources).where(eq(sources.enabled, 1));
  const allNewEvents: Array<ExtractedEvent & { sourceName: string }> = [];

  for (const source of enabledSources) {
    try {
      let extracted: ExtractedEvent[] = [];

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

      // Tag events with source name
      const tagged = extracted.map((e) => ({ ...e, sourceName: source.name }));
      allNewEvents.push(...tagged);

      // Update last scraped timestamp
      await db
        .update(sources)
        .set({ lastScrapedAt: new Date().toISOString() })
        .where(eq(sources.id, source.id));

      console.log(`[scraper] ${source.name}: found ${extracted.length} events`);
    } catch (err) {
      console.error(`[scraper] Error scraping ${source.name}:`, err);
    }
  }

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
