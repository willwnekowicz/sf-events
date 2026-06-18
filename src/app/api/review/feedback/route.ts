import { NextRequest, NextResponse } from "next/server";
import { recordFeedback } from "@/lib/review-state";

export const dynamic = "force-dynamic";

/** Record like/dislike + note for the room's current event (from the agent). */
export async function POST(request: NextRequest) {
  const { room, sentiment, note } = (await request.json().catch(() => ({}))) as {
    room?: string;
    sentiment?: "like" | "dislike";
    note?: string;
  };
  if (!room || (sentiment !== "like" && sentiment !== "dislike")) {
    return NextResponse.json({ error: "room and sentiment(like|dislike) required" }, { status: 400 });
  }
  const eventId = await recordFeedback(room, sentiment, note ?? "");
  if (eventId == null) return NextResponse.json({ error: "session/event not found" }, { status: 404 });
  return NextResponse.json({ ok: true, eventId });
}
