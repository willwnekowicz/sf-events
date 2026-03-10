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

  // Sort by final score descending within each date group
  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return b.finalScore - a.finalScore;
  });

  return NextResponse.json(filtered);
}
