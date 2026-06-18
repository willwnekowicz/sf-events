import { NextResponse } from "next/server";
import { db } from "@/db";
import { preferenceProfile, interactions, events } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { extractInterests, type Interests } from "@/lib/claude/extract-interests";

export const dynamic = "force-dynamic";

// Cache by (profile version : interaction count) so we don't re-run Claude on
// every page load — only when the profile or the reactions actually change.
const G = globalThis as unknown as { __profileInsights?: Map<string, Interests> };
const cache = (G.__profileInsights ??= new Map<string, Interests>());

export async function GET() {
  const [profile] = await db
    .select()
    .from(preferenceProfile)
    .orderBy(desc(preferenceProfile.version))
    .limit(1);

  const reactions = await db
    .select({ action: interactions.action, note: interactions.note, eventTitle: events.title })
    .from(interactions)
    .innerJoin(events, eq(interactions.eventId, events.id))
    .orderBy(desc(interactions.createdAt))
    .limit(60);

  const key = `${profile?.version ?? 0}:${reactions.length}`;
  const cached = cache.get(key);
  if (cached) return NextResponse.json(cached);

  const insights = await extractInterests(profile?.profileText ?? "", reactions);
  cache.set(key, insights);
  return NextResponse.json(insights);
}
