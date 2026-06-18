import { NextResponse } from "next/server";
import { db } from "@/db";
import { eventCalls } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** List the call log (most recent first). */
export async function GET() {
  const rows = await db.select().from(eventCalls).orderBy(desc(eventCalls.id)).limit(50);
  return NextResponse.json(rows);
}
