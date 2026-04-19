import { db } from "@/db";
import { events, interactions } from "@/db/schema";
import { gte, eq, inArray } from "drizzle-orm";

export async function mergeExistingEvents() {
  const now = new Date().toISOString();

  const allEvents = await db
    .select()
    .from(events)
    .where(gte(events.expiresAt, now));

  // Group by date
  const byDate = new Map<string, typeof allEvents>();
  for (const event of allEvents) {
    const group = byDate.get(event.date) ?? [];
    group.push(event);
    byDate.set(event.date, group);
  }

  let totalMerged = 0;

  for (const [, dateEvents] of byDate) {
    // Find clusters of similar events
    const used = new Set<number>();
    const clusters: (typeof dateEvents)[] = [];

    for (let i = 0; i < dateEvents.length; i++) {
      if (used.has(dateEvents[i].id)) continue;

      const cluster = [dateEvents[i]];
      used.add(dateEvents[i].id);

      for (let j = i + 1; j < dateEvents.length; j++) {
        if (used.has(dateEvents[j].id)) continue;
        if (titlesMatch(dateEvents[i].title, dateEvents[j].title)) {
          cluster.push(dateEvents[j]);
          used.add(dateEvents[j].id);
        }
      }

      if (cluster.length > 1) {
        clusters.push(cluster);
      }
    }

    // Merge each cluster
    for (const cluster of clusters) {
      await mergeCluster(cluster);
      totalMerged += cluster.length - 1;
    }
  }

  if (totalMerged > 0) {
    console.log(`[merge] Merged ${totalMerged} duplicate events.`);
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  if (na.startsWith(nb) || nb.startsWith(na)) return true;
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = [...wordsA].filter((w) => wordsB.has(w) && w.length > 2);
  const smaller = Math.min(wordsA.size, wordsB.size);
  if (smaller > 0 && intersection.length / smaller >= 0.8) return true;
  return false;
}

function parseSources(source: string): { name: string; url: string | null }[] {
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Not JSON, treat as plain source name
  }
  return [{ name: source, url: null }];
}

async function mergeCluster(cluster: typeof events.$inferSelect[]) {
  // Pick the best record: prefer longest description, has URL, highest score
  const sorted = [...cluster].sort((a, b) => {
    const scoreA = (a.description?.length ?? 0) + (a.url ? 100 : 0) + (a.relevanceScore ?? 0);
    const scoreB = (b.description?.length ?? 0) + (b.url ? 100 : 0) + (b.relevanceScore ?? 0);
    return scoreB - scoreA;
  });

  const primary = sorted[0];
  const duplicates = sorted.slice(1);
  const duplicateIds = duplicates.map((d) => d.id);

  // Collect all sources across the cluster
  const allSources = new Map<string, string | null>();
  for (const event of cluster) {
    const sources = parseSources(event.source);
    for (const s of sources) {
      // Keep the first URL we find for each source name
      if (!allSources.has(s.name)) {
        allSources.set(s.name, s.url ?? event.url);
      }
    }
  }

  const mergedSources = [...allSources.entries()].map(([name, url]) => ({ name, url }));

  // Pick best fields from the cluster
  const bestDescription = cluster
    .map((e) => e.description)
    .filter(Boolean)
    .sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))[0] ?? primary.description;

  const bestUrl = cluster.find((e) => e.url)?.url ?? primary.url;
  const bestAddress = cluster.find((e) => e.address)?.address ?? primary.address;
  const bestLat = cluster.find((e) => e.lat != null)?.lat ?? primary.lat;
  const bestLng = cluster.find((e) => e.lng != null)?.lng ?? primary.lng;
  const bestDistance = cluster.find((e) => e.distanceMiles != null)?.distanceMiles ?? primary.distanceMiles;
  const bestPrice = cluster.find((e) => e.price)?.price ?? primary.price;
  const bestScore = Math.max(...cluster.map((e) => e.relevanceScore ?? 0));

  // Update the primary record
  await db
    .update(events)
    .set({
      source: JSON.stringify(mergedSources),
      url: bestUrl,
      description: bestDescription,
      address: bestAddress,
      lat: bestLat,
      lng: bestLng,
      distanceMiles: bestDistance,
      price: bestPrice,
      relevanceScore: bestScore > 0 ? bestScore : primary.relevanceScore,
    })
    .where(eq(events.id, primary.id));

  // Reassign any interactions from duplicates to the primary
  if (duplicateIds.length > 0) {
    await db
      .update(interactions)
      .set({ eventId: primary.id })
      .where(inArray(interactions.eventId, duplicateIds));

    // Delete duplicates
    await db.delete(events).where(inArray(events.id, duplicateIds));
  }
}
