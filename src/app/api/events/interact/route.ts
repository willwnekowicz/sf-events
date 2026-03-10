import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { interactions } from "@/db/schema";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { eventId, action } = body;

  if (!eventId || !["thumbs_up", "thumbs_down", "calendar_added"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await db.insert(interactions).values({
    eventId,
    action,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}
