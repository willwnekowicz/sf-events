import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eventCalls } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Agent callback: store the friends named on the call (and optional transcript). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id);
  const body = (await request.json().catch(() => ({}))) as { friends?: string[]; transcript?: string };

  const set: Record<string, unknown> = {};
  if (body.friends) {
    // Merge with any previously captured names, de-duplicated.
    const [current] = await db.select({ friends: eventCalls.friends }).from(eventCalls).where(eq(eventCalls.id, callId));
    const prev: string[] = current?.friends ? (JSON.parse(current.friends) as string[]) : [];
    const merged = Array.from(new Set([...prev, ...body.friends].map((f) => f.trim()).filter(Boolean)));
    set.friends = JSON.stringify(merged);
  }
  if (body.transcript) set.transcript = body.transcript;

  if (Object.keys(set).length > 0) {
    await db.update(eventCalls).set(set).where(eq(eventCalls.id, callId));
  }
  return NextResponse.json({ ok: true });
}
