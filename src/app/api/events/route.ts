import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, interactions } from "@/db/schema";
import { desc, gte, eq, sql } from "drizzle-orm";
import { computeFinalScore } from "@/lib/scoring";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "all";

  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  // Fetch events with their latest interaction (if any)
  const allEvents = await db
    .select()
    .from(events)
    .where(gte(events.expiresAt, now))
    .orderBy(events.date, sql`COALESCE(${events.time}, '99:99')`);

  // Get all interactions and build a lookup map
  const allInteractions = await db.select().from(interactions);
  const interactionMap = new Map<number, string>();
  for (const i of allInteractions) {
    interactionMap.set(i.eventId, i.action);
  }

  // Compute final scores at query time and attach interaction status
  const scored = allEvents.map((event) => ({
    ...event,
    finalScore: computeFinalScore(
      event.relevanceScore,
      event.distanceMiles,
      event.date,
      today
    ),
    interaction: interactionMap.get(event.id) ?? null,
  }));

  // Apply filters
  let filtered = scored;
  if (filter === "today") {
    filtered = scored.filter((e) => e.date === today);
  } else if (filter === "week") {
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekEnd = weekFromNow.toISOString().split("T")[0];
    filtered = scored.filter((e) => e.date >= today && e.date <= weekEnd);
  } else if (filter === "unrated") {
    filtered = scored.filter((e) => e.interaction === null);
  }

  // Merge similar events from different sources
  const merged = mergeEvents(filtered);

  // Sort by final score descending within each date group
  merged.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return b.finalScore - a.finalScore;
  });

  return NextResponse.json(merged);
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
  // Exact match after normalization
  if (na === nb) return true;
  // One contains the other (handles "X" vs "X Comedy Show")
  if (na.startsWith(nb) || nb.startsWith(na)) return true;
  // High word overlap
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = [...wordsA].filter((w) => wordsB.has(w) && w.length > 2);
  const smaller = Math.min(wordsA.size, wordsB.size);
  if (smaller > 0 && intersection.length / smaller >= 0.8) return true;
  return false;
}

interface ScoredEvent {
  id: number;
  title: string;
  date: string;
  time: string | null;
  venue: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distanceMiles: number | null;
  description: string | null;
  price: string | null;
  url: string | null;
  imageUrl: string | null;
  source: string;
  relevanceScore: number | null;
  createdAt: string;
  expiresAt: string;
  finalScore: number;
  interaction: string | null;
}

interface MergedEvent extends Omit<ScoredEvent, "source" | "url"> {
  sources: { name: string; url: string | null }[];
}

function parseSources(source: string, url: string | null): { name: string; url: string | null }[] {
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Plain string source name
  }
  return [{ name: source, url }];
}

function mergeEvents(events: ScoredEvent[]): MergedEvent[] {
  const result: MergedEvent[] = [];
  const used = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (used.has(i)) continue;

    const primary = events[i];
    const sources = parseSources(primary.source, primary.url);
    const mergedIds = [primary.id];

    // Find duplicates: same date, similar title
    for (let j = i + 1; j < events.length; j++) {
      if (used.has(j)) continue;
      const candidate = events[j];
      if (candidate.date !== primary.date) continue;
      if (titlesMatch(primary.title, candidate.title)) {
        sources.push(...parseSources(candidate.source, candidate.url));
        mergedIds.push(candidate.id);
        used.add(j);
      }
    }

    used.add(i);

    // Deduplicate sources by name
    const uniqueSources = new Map<string, string | null>();
    for (const s of sources) {
      if (!uniqueSources.has(s.name) || (s.url && !uniqueSources.get(s.name))) {
        uniqueSources.set(s.name, s.url);
      }
    }

    const { source: _s, url: _u, ...rest } = primary;
    result.push({
      ...rest,
      sources: [...uniqueSources.entries()].map(([name, url]) => ({ name, url })),
      description: events
        .filter((e) => mergedIds.includes(e.id))
        .map((e) => e.description)
        .filter(Boolean)
        .sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))[0] ?? primary.description,
    });
  }

  return result;
}
