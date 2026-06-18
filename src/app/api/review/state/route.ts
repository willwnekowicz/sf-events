import { NextRequest, NextResponse } from "next/server";
import { getState } from "@/lib/review-state";

export const dynamic = "force-dynamic";

/** Current review state for a room — polled by the UI and the agent. */
export async function GET(request: NextRequest) {
  const room = new URL(request.url).searchParams.get("room");
  if (!room) return NextResponse.json({ error: "room required" }, { status: 400 });
  const state = getState(room);
  if (!state) return NextResponse.json({ error: "session not found" }, { status: 404 });
  return NextResponse.json(state);
}
