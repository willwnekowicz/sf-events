import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { preferenceProfile, interactions, events } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const profile = await db
    .select()
    .from(preferenceProfile)
    .orderBy(desc(preferenceProfile.version))
    .limit(1);

  const history = await db
    .select({
      id: interactions.id,
      action: interactions.action,
      createdAt: interactions.createdAt,
      eventTitle: events.title,
      eventVenue: events.venue,
    })
    .from(interactions)
    .innerJoin(events, eq(interactions.eventId, events.id))
    .orderBy(desc(interactions.createdAt))
    .limit(50);

  return NextResponse.json({
    profile: profile[0] ?? null,
    history,
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { profileText } = body;

  if (!profileText) {
    return NextResponse.json({ error: "profileText required" }, { status: 400 });
  }

  const latest = await db
    .select()
    .from(preferenceProfile)
    .orderBy(desc(preferenceProfile.version))
    .limit(1);

  const nextVersion = (latest[0]?.version ?? 0) + 1;

  await db.insert(preferenceProfile).values({
    profileText,
    version: nextVersion,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, version: nextVersion });
}
