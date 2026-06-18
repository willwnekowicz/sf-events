import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eventCalls } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["completed", "failed"]);

/** Status updates from the agent worker (ringing / in_progress / completed / failed). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id);
  const body = (await request.json().catch(() => ({}))) as { status?: string; errorMessage?: string };

  const [current] = await db.select().from(eventCalls).where(eq(eventCalls.id, callId));
  if (!current) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  // Never downgrade a terminal 'failed' into 'completed'.
  if (current.status === "failed" && body.status === "completed") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const set: Record<string, unknown> = {};
  if (body.status) {
    set.status = body.status;
    if (TERMINAL.has(body.status)) set.finishedAt = new Date().toISOString();
  }
  if (body.errorMessage) set.errorMessage = body.errorMessage;

  if (Object.keys(set).length > 0) {
    await db.update(eventCalls).set(set).where(eq(eventCalls.id, callId));
  }
  return NextResponse.json({ ok: true });
}
