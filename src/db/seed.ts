import { db } from "./index";
import { sources, preferenceProfile } from "./schema";
import { count } from "drizzle-orm";

const INITIAL_SOURCES = [
  { name: "Eventbrite", type: "platform" as const, searchQuery: "upcoming events in San Francisco this week site:eventbrite.com" },
  { name: "Meetup", type: "platform" as const, searchQuery: "upcoming events in San Francisco this week site:meetup.com" },
  { name: "Lu.ma", type: "platform" as const, searchQuery: "upcoming events in San Francisco this week site:lu.ma" },
  { name: "Partiful", type: "platform" as const, searchQuery: "upcoming events in San Francisco this week site:partiful.com" },
  { name: "Facebook Events", type: "platform" as const, searchQuery: "upcoming events in San Francisco this week site:facebook.com/events" },
  { name: "Google Events", type: "platform" as const, searchQuery: "things to do in San Francisco this week events" },
  { name: "SF Funcheap", type: "platform" as const, searchQuery: "upcoming events in San Francisco site:funcheap.com" },
  { name: "Manny's", type: "venue" as const, url: "https://welcometomannys.com/events" },
  { name: "KQED", type: "venue" as const, url: "https://www.kqed.org/events" },
];

const SEED_PROFILE = `Enjoys live podcast tapings and media events (e.g., KQED Close All Tabs). Interested in comedy and improv, especially with a startup/tech angle (e.g., Manny's One Hour Startup). Open to a wide range of events — cast a wide net initially.`;

export async function seedDatabase() {
  const [{ value: sourceCount }] = await db.select({ value: count() }).from(sources);

  if (sourceCount === 0) {
    for (const source of INITIAL_SOURCES) {
      await db.insert(sources).values({
        name: source.name,
        type: source.type,
        url: source.url ?? null,
        searchQuery: source.searchQuery ?? null,
        enabled: 1,
      });
    }
    console.log(`Seeded ${INITIAL_SOURCES.length} sources.`);
  }

  const [{ value: profileCount }] = await db.select({ value: count() }).from(preferenceProfile);

  if (profileCount === 0) {
    await db.insert(preferenceProfile).values({
      profileText: SEED_PROFILE,
      version: 1,
      createdAt: new Date().toISOString(),
    });
    console.log("Seeded preference profile.");
  }
}
