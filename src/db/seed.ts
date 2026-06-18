import { db } from "./index";
import { sources, preferenceProfile } from "./schema";
import { count } from "drizzle-orm";

// `method` picks which Bright Data product fetches the source.
const INITIAL_SOURCES = [
  { name: "Eventbrite", type: "platform" as const, method: "serp" as const, searchQuery: "upcoming events in San Francisco this week site:eventbrite.com" },
  { name: "Meetup", type: "platform" as const, method: "scraping_browser" as const, render: 1, url: "https://www.meetup.com/find/?location=us--ca--San%20Francisco&source=EVENTS", searchQuery: "upcoming events in San Francisco this week site:meetup.com" },
  { name: "Lu.ma", type: "platform" as const, method: "serp" as const, searchQuery: "upcoming events in San Francisco this week site:lu.ma" },
  { name: "Partiful", type: "platform" as const, method: "scraping_browser" as const, render: 1, searchQuery: "upcoming events in San Francisco this week site:partiful.com" },
  { name: "Facebook Events", type: "platform" as const, method: "web_data_facebook_events" as const, url: "https://www.facebook.com/events/explore/san-francisco-california/103074489720972/" },
  { name: "Google Events", type: "platform" as const, method: "serp" as const, searchQuery: "things to do in San Francisco this week events" },
  { name: "SF Funcheap", type: "venue" as const, method: "web_unlocker" as const, url: "https://sf.funcheap.com/" },
  { name: "Manny's", type: "venue" as const, method: "web_unlocker" as const, url: "https://welcometomannys.com/events" },
  { name: "KQED", type: "venue" as const, method: "web_unlocker" as const, url: "https://www.kqed.org/events" },
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
        method: source.method,
        render: source.render ?? 0,
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
