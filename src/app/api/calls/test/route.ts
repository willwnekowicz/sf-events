import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { desc, eq, isNotNull } from "drizzle-orm";
import { startCallForEvent, type CallableEvent } from "@/lib/livekit/notify";

export const dynamic = "force-dynamic";

/**
 * Demo trigger: call about a specific event (body `{eventId}`), else the
 * highest-scored event, else a synthetic sample so the call path can be verified
 * before scraping is producing events. Bypasses threshold/dedupe on purpose.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as { eventId?: number; phone?: string }));

  let event: CallableEvent | null = null;
  if (body.eventId) {
    const [e] = await db.select().from(events).where(eq(events.id, body.eventId));
    if (e) event = e;
  }
  if (!event) {
    const [top] = await db
      .select()
      .from(events)
      .where(isNotNull(events.relevanceScore))
      .orderBy(desc(events.relevanceScore))
      .limit(1);
    if (top) event = top;
  }
  if (!event) {
    // Synthetic sample event for demos with an empty DB.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    event = {
      id: null,
      title: "Manny's One Hour Startup",
      venue: "Manny's",
      date: tomorrow.toISOString().slice(0, 10),
      time: "18:30",
      description:
        "A live, interactive session where founders build a startup with the audience in one hour — comedy meets tech.",
      price: "Free",
      relevanceScore: 95,
    };
  }

  const callId = await startCallForEvent(event, { phone: body.phone });
  return NextResponse.json({ callId });
}
