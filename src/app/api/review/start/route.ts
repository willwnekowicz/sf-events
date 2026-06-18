import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, interactions } from "@/db/schema";
import { gte } from "drizzle-orm";
import { getLiveKitConfig, mintAccessToken, dispatchReviewAgent } from "@/lib/livekit/client";
import { createSession } from "@/lib/review-state";

export const dynamic = "force-dynamic";

export interface ReviewEvent {
  id: number;
  title: string;
  venue: string;
  date: string;
  time: string | null;
  description: string | null;
  price: string | null;
  relevanceScore: number | null;
  url: string | null;
}

/** Start a voice-review session: queue of unrated events + LiveKit token + agent. */
export async function POST() {
  const cfg = getLiveKitConfig();
  if (!cfg) {
    return NextResponse.json({ error: "LiveKit not configured (LIVEKIT_URL/API_KEY/API_SECRET)" }, { status: 500 });
  }

  const now = new Date().toISOString();
  const upcoming = await db.select().from(events).where(gte(events.expiresAt, now));
  const interacted = new Set((await db.select({ id: interactions.eventId }).from(interactions)).map((r) => r.id));

  const queue: ReviewEvent[] = upcoming
    .filter((e) => !interacted.has(e.id))
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, 12)
    .map((e) => ({
      id: e.id,
      title: e.title,
      venue: e.venue,
      date: e.date,
      time: e.time,
      description: e.description,
      price: e.price,
      relevanceScore: e.relevanceScore,
      url: e.url,
    }));

  if (queue.length === 0) {
    return NextResponse.json({ events: [], room: null, token: null, url: cfg.url });
  }

  const room = `review-${Date.now()}`;
  createSession(room, queue);
  const token = await mintAccessToken(room, "user");
  try {
    await dispatchReviewAgent(room, { room, events: queue });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Failed to dispatch review agent", message }, { status: 500 });
  }

  return NextResponse.json({ token, url: cfg.url, room, events: queue });
}
