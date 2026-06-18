import { NextRequest, NextResponse } from "next/server";
import { advance } from "@/lib/review-state";

export const dynamic = "force-dynamic";

/** Advance the cursor. Called by both the UI Next button and the agent. */
export async function POST(request: NextRequest) {
  const { room } = (await request.json().catch(() => ({}))) as { room?: string };
  if (!room) return NextResponse.json({ error: "room required" }, { status: 400 });
  const state = advance(room);
  if (!state) return NextResponse.json({ error: "session not found" }, { status: 404 });
  return NextResponse.json(state);
}
