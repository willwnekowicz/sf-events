import { NextRequest, NextResponse } from "next/server";
import { setAnnounced, finish } from "@/lib/review-state";

export const dynamic = "force-dynamic";

/** Agent-only: report the currently-narrated event index, or mark the session done. */
export async function POST(request: NextRequest) {
  const { room, action, index } = (await request.json().catch(() => ({}))) as {
    room?: string;
    action?: "announce" | "finish";
    index?: number;
  };
  if (!room) return NextResponse.json({ error: "room required" }, { status: 400 });

  const state = action === "finish" ? finish(room) : setAnnounced(room, index ?? 0);
  if (!state) return NextResponse.json({ error: "session not found" }, { status: 404 });
  return NextResponse.json(state);
}
