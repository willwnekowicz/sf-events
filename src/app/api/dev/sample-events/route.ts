import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, interactions } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Realistic SF events (varied relevance) so the voice-review screen has content
// to demo before Bright Data scraping is live. Mix of on-profile and off-profile
// so feedback is meaningful.
const SAMPLES = [
  { title: "KQED Live: Close All Tabs Podcast Taping", venue: "KQED HQ", description: "Live taping of KQED's tech-culture podcast with audience Q&A.", price: "Free", score: 96 },
  { title: "Manny's One Hour Startup", venue: "Manny's", description: "Founders build a startup live with the audience — comedy meets tech.", price: "$10", score: 94 },
  { title: "AI Agents Hackathon", venue: "GitHub HQ", description: "Build and ship an AI agent in a day; prizes and demos at the end.", price: "Free", score: 92 },
  { title: "AI Tinkerers Demo Night", venue: "SHACK15", description: "Builders demo weekend AI projects; drinks and networking after.", price: "Free", score: 89 },
  { title: "Founders & Funders Mixer", venue: "SHACK15", description: "Early-stage founders meet seed investors over drinks.", price: "$15", score: 86 },
  { title: "Climate Tech Demo Day", venue: "Pier 70", description: "Startups pitch hardware and software tackling climate change.", price: "Free", score: 80 },
  { title: "Stand-Up Comedy Open Mic", venue: "The Punch Line", description: "Up-and-coming comics test new material; rowdy crowd.", price: "$12", score: 71 },
  { title: "Indie Game Dev Showcase", venue: "GDC Annex", description: "Play unreleased indie games and meet their makers.", price: "$20", score: 67 },
  { title: "Live Jazz at SFJAZZ", venue: "SFJAZZ Center", description: "An evening of contemporary jazz from a touring quartet.", price: "$45", score: 60 },
  { title: "Sunset Cinema: Outdoor Movie Night", venue: "Dolores Park", description: "Bring a blanket for a cult-classic screening under the stars.", price: "Free", score: 54 },
  { title: "Warriors vs. Lakers", venue: "Chase Center", description: "NBA regular season matchup.", price: "$80+", score: 48 },
  { title: "Morning Yoga in the Park", venue: "Golden Gate Park", description: "All-levels outdoor vinyasa flow to start the day.", price: "$8", score: 33 },
];

/** Reset the demo pool: clear prior sample events + feedback, then reseed 12. */
export async function POST() {
  // Clean slate so the demo can be re-run with a full queue.
  const prior = await db.select({ id: events.id }).from(events).where(eq(events.source, "Sample"));
  if (prior.length > 0) {
    const ids = prior.map((e) => e.id);
    await db.delete(interactions).where(inArray(interactions.eventId, ids));
    await db.delete(events).where(inArray(events.id, ids));
  }

  const now = new Date();
  let inserted = 0;
  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i];
    const d = new Date(now);
    d.setDate(d.getDate() + 1 + (i % 7)); // spread across the next week
    const date = d.toISOString().slice(0, 10);
    const expiresAt = new Date(d);
    expiresAt.setDate(expiresAt.getDate() + 1);

    const res = await db
      .insert(events)
      .values({
        title: s.title,
        date,
        time: "18:30",
        venue: s.venue,
        address: null,
        description: s.description,
        price: s.price,
        url: null,
        imageUrl: null,
        source: "Sample",
        relevanceScore: s.score,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      })
      .onConflictDoNothing();
    if ((res as unknown as { changes: number }).changes > 0) inserted++;
  }
  return NextResponse.json({ inserted, total: SAMPLES.length });
}
