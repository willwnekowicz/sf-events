# SF Events Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-run Next.js app that discovers Bay Area events, scores them with Claude against learned preferences, and displays them on a vertical TV with an interactive dashboard.

**Architecture:** Single Next.js 14 App Router app with SQLite (Drizzle ORM) for storage. A node-cron job runs every 4 hours to discover events via Claude API (web search for platforms, HTML extraction for venues), score them, and store results. Two routes: `/tv` (read-only dark-themed vertical display) and `/dashboard` (interactive light-themed control panel).

**Tech Stack:** Next.js 14 (App Router, TypeScript), SQLite + Drizzle ORM + better-sqlite3, Anthropic SDK (@anthropic-ai/sdk), node-cron, Tailwind CSS, Nominatim geocoding

**Spec:** `docs/superpowers/specs/2026-03-09-sf-events-dashboard-design.md`

---

## Chunk 1: Project Scaffolding & Database

### File Structure (Chunk 1)

```
sf-events/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout
│   │   └── page.tsx              # Redirect to /dashboard
│   ├── db/
│   │   ├── index.ts              # Database connection (better-sqlite3 + drizzle)
│   │   ├── schema.ts             # Drizzle schema definitions
│   │   └── seed.ts               # Seed initial sources and preference profile
│   └── lib/
│       └── scoring.ts            # Composite score computation (pure function)
├── drizzle.config.ts             # Drizzle config
├── .env.local                    # ANTHROPIC_API_KEY (gitignored)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

### Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Create Next.js app with Tailwind**

Run:
```bash
cd /Users/william/ai/sf-events
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Accept defaults. This scaffolds the full Next.js project.

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install drizzle-orm better-sqlite3 @anthropic-ai/sdk node-cron
npm install -D drizzle-kit @types/better-sqlite3 @types/node-cron
```

- [ ] **Step 3: Create .env.local**

Create `.env.local` with:
```
ANTHROPIC_API_KEY=your-key-here
```

- [ ] **Step 4: Verify project starts**

Run: `npm run dev`
Expected: Next.js dev server starts on port 3000. Visit http://localhost:3000 and see the default Next.js page.

- [ ] **Step 5: Update root page to redirect to dashboard**

Modify `src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

### Task 2: Database schema and connection

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`

- [ ] **Step 1: Create Drizzle schema**

Create `src/db/schema.ts`:
```ts
import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  date: text("date").notNull(),        // YYYY-MM-DD
  time: text("time"),                   // HH:MM (nullable — some events don't specify)
  venue: text("venue").notNull(),
  address: text("address"),
  lat: real("lat"),
  lng: real("lng"),
  distanceMiles: real("distance_miles"),
  description: text("description"),
  price: text("price"),
  url: text("url"),
  imageUrl: text("image_url"),
  source: text("source").notNull(),
  relevanceScore: integer("relevance_score"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => ({
  uniqueEvent: uniqueIndex("unique_event").on(table.date, table.title, table.venue),
}));

export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(),          // "platform" | "venue"
  url: text("url"),
  searchQuery: text("search_query"),
  enabled: integer("enabled").notNull().default(1),
  lastScrapedAt: text("last_scraped_at"),
});

export const interactions = sqliteTable("interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull().references(() => events.id),
  action: text("action").notNull(),       // "thumbs_up" | "thumbs_down" | "calendar_added"
  createdAt: text("created_at").notNull(),
});

export const preferenceProfile = sqliteTable("preference_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileText: text("profile_text").notNull(),
  version: integer("version").notNull(),
  createdAt: text("created_at").notNull(),
});

export const geocodeCache = sqliteTable("geocode_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address").notNull().unique(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
});
```

- [ ] **Step 2: Create database connection**

Create `src/db/index.ts`:
```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = path.join(process.cwd(), "sf-events.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
```

- [ ] **Step 3: Create Drizzle config**

Create `drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./sf-events.db",
  },
});
```

- [ ] **Step 4: Generate and run migration**

Run:
```bash
npx drizzle-kit generate
npx drizzle-kit push
```

Expected: Migration files created in `drizzle/` directory. Database file `sf-events.db` created.

- [ ] **Step 5: Add database files to .gitignore**

Append to `.gitignore`:
```
sf-events.db
sf-events.db-wal
sf-events.db-shm
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add database schema and Drizzle ORM setup"
```

---

### Task 3: Seed data and scoring function

**Files:**
- Create: `src/db/seed.ts`, `src/lib/scoring.ts`
- Test: `src/lib/__tests__/scoring.test.ts`

- [ ] **Step 1: Write scoring function tests**

Create `src/lib/__tests__/scoring.test.ts`:
```ts
import { computeFinalScore } from "../scoring";

describe("computeFinalScore", () => {
  const today = "2026-03-09";

  it("returns relevance score with no distance and same-day boost", () => {
    const result = computeFinalScore(80, 0, today, today);
    expect(result).toBe(90); // 80 + 0 + 10
  });

  it("applies distance penalty of 1 per mile capped at 15", () => {
    const result = computeFinalScore(80, 20, today, today);
    expect(result).toBe(75); // 80 - 15 + 10
  });

  it("applies tomorrow recency boost of 8", () => {
    const result = computeFinalScore(80, 0, "2026-03-10", today);
    expect(result).toBe(88); // 80 + 0 + 8
  });

  it("applies 2-day recency boost of 6", () => {
    const result = computeFinalScore(80, 0, "2026-03-11", today);
    expect(result).toBe(86); // 80 + 0 + 6
  });

  it("applies 3-4 day recency boost of 4", () => {
    const result = computeFinalScore(80, 0, "2026-03-12", today);
    expect(result).toBe(84); // 80 + 0 + 4
  });

  it("applies 5-7 day recency boost of 2", () => {
    const result = computeFinalScore(80, 0, "2026-03-14", today);
    expect(result).toBe(82); // 80 + 0 + 2
  });

  it("applies no recency boost beyond 7 days", () => {
    const result = computeFinalScore(80, 0, "2026-03-17", today);
    expect(result).toBe(80); // 80 + 0 + 0
  });

  it("handles null relevance score as 50", () => {
    const result = computeFinalScore(null, 0, today, today);
    expect(result).toBe(60); // 50 + 0 + 10
  });
});
```

- [ ] **Step 2: Install Jest and configure**

Run:
```bash
npm install -D jest ts-jest @types/jest
```

Create `jest.config.ts`:
```ts
import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default config;
```

Add to `package.json` scripts: `"test": "jest"`

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scoring'`

- [ ] **Step 4: Implement scoring function**

Create `src/lib/scoring.ts`:
```ts
export function computeFinalScore(
  relevanceScore: number | null,
  distanceMiles: number | null,
  eventDate: string,
  today: string
): number {
  const relevance = relevanceScore ?? 50;
  const distance = Math.min(distanceMiles ?? 0, 15);
  const distancePenalty = Math.floor(distance);

  const eventMs = new Date(eventDate).getTime();
  const todayMs = new Date(today).getTime();
  const daysAway = Math.round((eventMs - todayMs) / (1000 * 60 * 60 * 24));

  let recencyBoost = 0;
  if (daysAway <= 0) recencyBoost = 10;
  else if (daysAway === 1) recencyBoost = 8;
  else if (daysAway === 2) recencyBoost = 6;
  else if (daysAway <= 4) recencyBoost = 4;
  else if (daysAway <= 7) recencyBoost = 2;

  return relevance - distancePenalty + recencyBoost;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: All 8 tests PASS.

- [ ] **Step 6: Create seed script**

Create `src/db/seed.ts`:
```ts
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
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add scoring function with tests and database seed script"
```

---

## Chunk 2: Geocoding & Claude Integration

### File Structure (Chunk 2)

```
src/
├── lib/
│   ├── geocoding.ts              # Nominatim geocoding with caching
│   ├── claude/
│   │   ├── client.ts             # Anthropic SDK client singleton
│   │   ├── extract-events.ts     # Extract events from HTML or web search
│   │   ├── score-events.ts       # Score events against preference profile
│   │   ├── deduplicate.ts        # Ask Claude to identify duplicates
│   │   └── update-profile.ts     # Regenerate preference profile from interactions
│   └── __tests__/
│       └── geocoding.test.ts
```

### Task 4: Geocoding with Nominatim

**Files:**
- Create: `src/lib/geocoding.ts`, `src/lib/__tests__/geocoding.test.ts`

- [ ] **Step 1: Write geocoding tests**

Create `src/lib/__tests__/geocoding.test.ts`:
```ts
import { computeDistanceMiles } from "../geocoding";

describe("computeDistanceMiles", () => {
  // 1550 Mission St coords: approximately 37.7725, -122.4175
  it("returns 0 for the home location", () => {
    const distance = computeDistanceMiles(37.7725, -122.4175);
    expect(distance).toBeLessThan(0.1);
  });

  it("returns reasonable distance for a known location", () => {
    // SF Jazz Center is roughly 1.5-2 miles from 1550 Mission
    const distance = computeDistanceMiles(37.7762, -122.4213);
    expect(distance).toBeGreaterThan(0.1);
    expect(distance).toBeLessThan(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- geocoding`
Expected: FAIL — `Cannot find module '../geocoding'`

- [ ] **Step 3: Implement geocoding module**

Create `src/lib/geocoding.ts`:
```ts
import { db } from "@/db";
import { geocodeCache } from "@/db/schema";
import { eq } from "drizzle-orm";

const HOME_LAT = 37.7725;
const HOME_LNG = -122.4175;
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "sf-events-dashboard/1.0";

export function computeDistanceMiles(lat: number, lng: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(lat - HOME_LAT);
  const dLng = toRad(lng - HOME_LNG);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(HOME_LAT)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  // Check cache first
  const cached = await db.select().from(geocodeCache).where(eq(geocodeCache.address, address)).limit(1);
  if (cached.length > 0) {
    return { lat: cached[0].lat, lng: cached[0].lng };
  }

  // Rate limit: 1 req/sec
  await new Promise((r) => setTimeout(r, 1100));

  const params = new URLSearchParams({
    q: address,
    format: "json",
    limit: "1",
    countrycodes: "us",
  });

  const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.length) return null;

  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);

  // Cache result
  await db.insert(geocodeCache).values({ address, lat, lng }).onConflictDoNothing();

  return { lat, lng };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- geocoding`
Expected: Both tests PASS (distance computation is pure math, no network).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Nominatim geocoding with distance calculation and caching"
```

---

### Task 5: Claude API client and event extraction

**Files:**
- Create: `src/lib/claude/client.ts`, `src/lib/claude/extract-events.ts`

- [ ] **Step 1: Create Claude client singleton**

Create `src/lib/claude/client.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}
```

- [ ] **Step 2: Create event extraction module**

Create `src/lib/claude/extract-events.ts`:
```ts
import { getClaudeClient } from "./client";

export interface ExtractedEvent {
  title: string;
  date: string;       // YYYY-MM-DD
  time: string | null; // HH:MM
  venue: string;
  address: string | null;
  description: string | null;
  price: string | null;
  url: string | null;
  imageUrl: string | null;
}

const EVENT_SCHEMA = `Return a JSON array of events. Each event object must have:
- title (string, required)
- date (string, YYYY-MM-DD format, required)
- time (string, HH:MM 24-hour format, or null)
- venue (string, required)
- address (string, full street address in San Francisco, or null)
- description (string, 1-2 sentence summary, or null)
- price (string like "Free", "$15", "$20-$45", or null)
- url (string, direct link to event page, or null)
- imageUrl (string, event image URL, or null)

Only include events in San Francisco / Bay Area. Only include events happening today or in the future. Return valid JSON only, no markdown.`;

export async function extractEventsFromHtml(
  html: string,
  sourceName: string
): Promise<ExtractedEvent[]> {
  const client = getClaudeClient();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Extract all upcoming events from this ${sourceName} events page HTML. ${EVENT_SCHEMA}\n\nHTML:\n${html.slice(0, 50000)}`,
      },
    ],
  });

  return parseEventsResponse(response);
}

export async function extractEventsViaWebSearch(
  query: string,
  sourceName: string
): Promise<ExtractedEvent[]> {
  const client = getClaudeClient();

  const today = new Date().toISOString().split("T")[0];

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
    messages: [
      {
        role: "user",
        content: `Search for: ${query}

Find upcoming events from today (${today}) through the next 30 days. ${EVENT_SCHEMA}

After searching, compile all events you found into the JSON array format described above.`,
      },
    ],
  });

  return parseEventsResponse(response);
}

function parseEventsResponse(response: Anthropic.Messages.Message): ExtractedEvent[] {
  for (const block of response.content) {
    if (block.type === "text") {
      try {
        // Try to find JSON array in the response
        const jsonMatch = block.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.error("Failed to parse events JSON:", block.text.slice(0, 200));
      }
    }
  }
  return [];
}
```

Note: The web search tool configuration uses the `web_search_20250305` server-side tool type. If the Anthropic SDK version installed exposes a different tool type name, update the `type` field accordingly — check the SDK's TypeScript types or the [Anthropic API docs](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search) for the current shape.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Claude client and event extraction (HTML + web search)"
```

---

### Task 6: Claude scoring and deduplication

**Files:**
- Create: `src/lib/claude/score-events.ts`, `src/lib/claude/deduplicate.ts`, `src/lib/claude/update-profile.ts`

- [ ] **Step 1: Create event scoring module**

Create `src/lib/claude/score-events.ts`:
```ts
import { getClaudeClient } from "./client";
import type { ExtractedEvent } from "./extract-events";

export async function scoreEvents(
  events: ExtractedEvent[],
  profileText: string
): Promise<Map<string, number>> {
  if (events.length === 0) return new Map();

  const client = getClaudeClient();

  const eventList = events
    .map((e, i) => `${i}. "${e.title}" - ${e.venue} - ${e.description ?? "no description"} - ${e.price ?? "unknown price"}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are an event recommendation engine. Score each event 0-100 based on how well it matches this user's preferences.

USER PREFERENCES:
${profileText}

EVENTS TO SCORE:
${eventList}

Return a JSON object mapping event index (as string) to score (integer 0-100). Only valid JSON, no markdown.
Example: {"0": 85, "1": 42, "2": 91}`,
      },
    ],
  });

  const scores = new Map<string, number>();

  for (const block of response.content) {
    if (block.type === "text") {
      try {
        const jsonMatch = block.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const [idx, score] of Object.entries(parsed)) {
            const event = events[parseInt(idx)];
            if (event) {
              scores.set(`${event.title}|${event.date}|${event.venue}`, score as number);
            }
          }
        }
      } catch {
        console.error("Failed to parse scores:", block.text.slice(0, 200));
      }
    }
  }

  return scores;
}
```

- [ ] **Step 2: Create deduplication module**

Create `src/lib/claude/deduplicate.ts`:
```ts
import { getClaudeClient } from "./client";
import type { ExtractedEvent } from "./extract-events";

interface ExistingEvent {
  title: string;
  venue: string;
}

export async function filterDuplicates(
  newEvents: ExtractedEvent[],
  existingEvents: ExistingEvent[]
): Promise<ExtractedEvent[]> {
  if (existingEvents.length === 0) return newEvents;
  if (newEvents.length === 0) return [];

  const client = getClaudeClient();

  const existingList = existingEvents
    .map((e, i) => `${i}. "${e.title}" at ${e.venue}`)
    .join("\n");

  const newList = newEvents
    .map((e, i) => `${i}. "${e.title}" at ${e.venue}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Identify which new events are duplicates of existing events. Account for minor name/venue variations (e.g., "Manny's" vs "Mannys SF" are the same venue).

EXISTING EVENTS:
${existingList}

NEW EVENTS:
${newList}

Return a JSON array of new event indices that are NOT duplicates (i.e., truly new events). Only valid JSON, no markdown.
Example: [0, 2, 5]`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "text") {
      try {
        const jsonMatch = block.text.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const keepIndices: number[] = JSON.parse(jsonMatch[0]);
          return keepIndices.filter((i) => i < newEvents.length).map((i) => newEvents[i]);
        }
      } catch {
        console.error("Failed to parse dedup response:", block.text.slice(0, 200));
      }
    }
  }

  // On failure, return all events (DB unique index will catch exact dupes)
  return newEvents;
}
```

- [ ] **Step 3: Create profile update module**

Create `src/lib/claude/update-profile.ts`:
```ts
import { getClaudeClient } from "./client";

interface InteractionRecord {
  action: string;
  eventTitle: string;
  eventDescription: string | null;
  eventVenue: string;
}

export async function regenerateProfile(
  currentProfile: string,
  interactions: InteractionRecord[]
): Promise<string> {
  if (interactions.length === 0) return currentProfile;

  const client = getClaudeClient();

  const interactionList = interactions
    .map(
      (i) =>
        `${i.action === "thumbs_up" ? "LIKED" : i.action === "thumbs_down" ? "DISLIKED" : "ADDED TO CALENDAR"}: "${i.eventTitle}" at ${i.eventVenue}${i.eventDescription ? ` — ${i.eventDescription}` : ""}`
    )
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Update this user preference profile based on their recent event interactions. Keep the same natural language style. Incorporate what the new interactions tell us about their tastes — what they like more of, what they want less of. Don't remove existing preferences unless directly contradicted.

CURRENT PROFILE:
${currentProfile}

RECENT INTERACTIONS:
${interactionList}

Return only the updated profile text, no JSON or formatting.`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "text") {
      return block.text.trim();
    }
  }

  return currentProfile;
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Claude scoring, deduplication, and profile update modules"
```

---

## Chunk 3: Scraper Pipeline & API Routes

### File Structure (Chunk 3)

```
src/
├── lib/
│   └── scraper/
│       └── pipeline.ts           # Orchestrates full scrape cycle
├── app/
│   └── api/
│       ├── events/
│       │   └── route.ts          # GET events, POST interaction
│       ├── sources/
│       │   └── route.ts          # CRUD sources
│       ├── profile/
│       │   └── route.ts          # GET/PUT preference profile
│       └── scrape/
│           └── route.ts          # POST trigger manual scrape
```

### Task 7: Scraper pipeline

**Files:**
- Create: `src/lib/scraper/pipeline.ts`

- [ ] **Step 1: Create the scraper pipeline**

Create `src/lib/scraper/pipeline.ts`:
```ts
import { db } from "@/db";
import { events, sources, interactions, preferenceProfile, geocodeCache } from "@/db/schema";
import { eq, and, lt, count, desc } from "drizzle-orm";
import { extractEventsFromHtml, extractEventsViaWebSearch, type ExtractedEvent } from "@/lib/claude/extract-events";
import { scoreEvents } from "@/lib/claude/score-events";
import { filterDuplicates } from "@/lib/claude/deduplicate";
import { regenerateProfile } from "@/lib/claude/update-profile";
import { geocodeAddress, computeDistanceMiles } from "@/lib/geocoding";

export async function runScrapeCycle() {
  console.log(`[scraper] Starting scrape cycle at ${new Date().toISOString()}`);

  // Step 1: Clean up expired events (older than 7 days past)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  await db.delete(events).where(lt(events.expiresAt, sevenDaysAgo.toISOString()));

  // Step 2: Update preference profile if new interactions exist
  await maybeUpdateProfile();

  // Step 3: Fetch events from all enabled sources
  const enabledSources = await db.select().from(sources).where(eq(sources.enabled, 1));
  const allNewEvents: Array<ExtractedEvent & { sourceName: string }> = [];

  for (const source of enabledSources) {
    try {
      let extracted: ExtractedEvent[] = [];

      if (source.type === "venue" && source.url) {
        // Try direct HTML fetch first
        const res = await fetch(source.url, {
          headers: { "User-Agent": "sf-events-dashboard/1.0" },
        });
        if (res.ok) {
          const html = await res.text();
          extracted = await extractEventsFromHtml(html, source.name);
        }

        // Fall back to web search if HTML extraction yielded nothing
        if (extracted.length === 0) {
          extracted = await extractEventsViaWebSearch(
            `upcoming events at ${source.name} San Francisco`,
            source.name
          );
        }
      } else if (source.type === "platform" && source.searchQuery) {
        extracted = await extractEventsViaWebSearch(source.searchQuery, source.name);
      }

      // Tag events with source name
      const tagged = extracted.map((e) => ({ ...e, sourceName: source.name }));
      allNewEvents.push(...tagged);

      // Update last scraped timestamp
      await db
        .update(sources)
        .set({ lastScrapedAt: new Date().toISOString() })
        .where(eq(sources.id, source.id));

      console.log(`[scraper] ${source.name}: found ${extracted.length} events`);
    } catch (err) {
      console.error(`[scraper] Error scraping ${source.name}:`, err);
    }
  }

  if (allNewEvents.length === 0) {
    console.log("[scraper] No events found this cycle.");
    return;
  }

  // Step 4: Deduplicate against existing events
  const existingEvents = await db
    .select({ title: events.title, venue: events.venue })
    .from(events);

  const uniqueEvents = await filterDuplicates(allNewEvents, existingEvents);
  console.log(`[scraper] ${uniqueEvents.length} new events after dedup (from ${allNewEvents.length} total)`);

  if (uniqueEvents.length === 0) return;

  // Step 5: Score events
  const profile = await db
    .select()
    .from(preferenceProfile)
    .orderBy(desc(preferenceProfile.version))
    .limit(1);

  const profileText = profile[0]?.profileText ?? "";
  const scores = await scoreEvents(uniqueEvents, profileText);

  // Step 6: Geocode and insert events
  for (const event of uniqueEvents) {
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      let distanceMiles: number | null = null;

      if (event.address) {
        const coords = await geocodeAddress(event.address);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
          distanceMiles = computeDistanceMiles(lat, lng);
        }
      }

      const scoreKey = `${event.title}|${event.date}|${event.venue}`;
      const relevanceScore = scores.get(scoreKey) ?? null;

      const expiresAt = new Date(event.date);
      expiresAt.setDate(expiresAt.getDate() + 1);

      await db
        .insert(events)
        .values({
          title: event.title,
          date: event.date,
          time: event.time,
          venue: event.venue,
          address: event.address,
          lat,
          lng,
          distanceMiles,
          description: event.description,
          price: event.price,
          url: event.url,
          imageUrl: event.imageUrl,
          source: event.sourceName,
          relevanceScore,
          createdAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
        })
        .onConflictDoNothing();
    } catch (err) {
      console.error(`[scraper] Error inserting event "${event.title}":`, err);
    }
  }

  console.log(`[scraper] Scrape cycle complete.`);
}

async function maybeUpdateProfile() {
  const latestProfile = await db
    .select()
    .from(preferenceProfile)
    .orderBy(desc(preferenceProfile.version))
    .limit(1);

  if (!latestProfile[0]) return;

  const lastProfileDate = latestProfile[0].createdAt;

  // Check if any interactions are newer than the last profile update
  const newestInteraction = await db
    .select({ createdAt: interactions.createdAt })
    .from(interactions)
    .orderBy(desc(interactions.createdAt))
    .limit(1);

  if (!newestInteraction[0] || newestInteraction[0].createdAt <= lastProfileDate) {
    return; // No new interactions since last profile update
  }

  // Get all interactions for profile regeneration
  const allInteractions = await db
    .select({
      action: interactions.action,
      eventTitle: events.title,
      eventDescription: events.description,
      eventVenue: events.venue,
    })
    .from(interactions)
    .innerJoin(events, eq(interactions.eventId, events.id));

  const newProfileText = await regenerateProfile(
    latestProfile[0].profileText,
    allInteractions
  );

  await db.insert(preferenceProfile).values({
    profileText: newProfileText,
    version: latestProfile[0].version + 1,
    createdAt: new Date().toISOString(),
  });

  console.log(`[scraper] Updated preference profile to version ${latestProfile[0].version + 1}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add scraper pipeline orchestrating full scrape cycle"
```

---

### Task 8: API routes

**Files:**
- Create: `src/app/api/events/route.ts`, `src/app/api/sources/route.ts`, `src/app/api/profile/route.ts`, `src/app/api/scrape/route.ts`

- [ ] **Step 1: Create events API route**

Create `src/app/api/events/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, interactions } from "@/db/schema";
import { desc, gte, eq, sql } from "drizzle-orm";
import { computeFinalScore } from "@/lib/scoring";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "all";

  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  // Fetch events with their latest interaction (if any)
  const allEvents = await db
    .select()
    .from(events)
    .where(gte(events.expiresAt, now))
    .orderBy(events.date, sql`COALESCE(${events.time}, '99:99')`);

  // Get all interactions and build a lookup map
  const allInteractions = await db.select().from(interactions);
  const interactionMap = new Map<number, string>();
  for (const i of allInteractions) {
    interactionMap.set(i.eventId, i.action);
  }

  // Compute final scores at query time and attach interaction status
  const scored = allEvents.map((event) => ({
    ...event,
    finalScore: computeFinalScore(
      event.relevanceScore,
      event.distanceMiles,
      event.date,
      today
    ),
    interaction: interactionMap.get(event.id) ?? null,
  }));

  // Apply filters
  let filtered = scored;
  if (filter === "today") {
    filtered = scored.filter((e) => e.date === today);
  } else if (filter === "week") {
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekEnd = weekFromNow.toISOString().split("T")[0];
    filtered = scored.filter((e) => e.date >= today && e.date <= weekEnd);
  } else if (filter === "unrated") {
    filtered = scored.filter((e) => e.interaction === null);
  }

  // Sort by final score descending within each date group
  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return b.finalScore - a.finalScore;
  });

  return NextResponse.json(filtered);
}
```

- [ ] **Step 2: Create interactions API (separate file for clarity)**

Create `src/app/api/events/interact/route.ts`:
```ts
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
```

- [ ] **Step 3: Create sources API route**

Create `src/app/api/sources/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sources } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const allSources = await db.select().from(sources);
  return NextResponse.json(allSources);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, type, url, searchQuery } = body;

  if (!name || !type) {
    return NextResponse.json({ error: "Name and type required" }, { status: 400 });
  }
  if (type === "venue" && !url) {
    return NextResponse.json({ error: "URL required for venue sources" }, { status: 400 });
  }
  if (type === "platform" && !searchQuery) {
    return NextResponse.json({ error: "Search query required for platform sources" }, { status: 400 });
  }

  const result = await db.insert(sources).values({
    name,
    type,
    url: url ?? null,
    searchQuery: searchQuery ?? null,
    enabled: 1,
  });

  return NextResponse.json({ success: true, id: result.lastInsertRowid });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, enabled } = body;

  if (id === undefined || enabled === undefined) {
    return NextResponse.json({ error: "id and enabled required" }, { status: 400 });
  }

  await db.update(sources).set({ enabled }).where(eq(sources.id, id));
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await db.delete(sources).where(eq(sources.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create profile API route**

Create `src/app/api/profile/route.ts`:
```ts
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
```

- [ ] **Step 5: Create scrape trigger API route**

Create `src/app/api/scrape/route.ts`:
```ts
import { NextResponse } from "next/server";
import { runScrapeCycle } from "@/lib/scraper/pipeline";

let isRunning = false;

export async function POST() {
  if (isRunning) {
    return NextResponse.json({ error: "Scrape already in progress" }, { status: 409 });
  }

  isRunning = true;
  try {
    await runScrapeCycle();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/scrape] Error:", err);
    return NextResponse.json({ error: "Scrape failed" }, { status: 500 });
  } finally {
    isRunning = false;
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add API routes for events, sources, profile, and scrape trigger"
```

---

### Task 9: Cron scheduler and app initialization

**Files:**
- Create: `src/lib/cron.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create cron scheduler**

Create `src/lib/cron.ts`:
```ts
import cron from "node-cron";
import { runScrapeCycle } from "@/lib/scraper/pipeline";
import { seedDatabase } from "@/db/seed";

let initialized = false;

export function initializeApp() {
  if (initialized) return;
  initialized = true;

  // Seed database on first run
  seedDatabase().then(() => {
    console.log("[init] Database seeded (if needed).");
  });

  // Run scrape cycle every 4 hours
  cron.schedule("0 */4 * * *", async () => {
    console.log("[cron] Triggering scheduled scrape cycle...");
    try {
      await runScrapeCycle();
    } catch (err) {
      console.error("[cron] Scrape cycle error:", err);
    }
  });

  console.log("[init] Cron scheduler started (every 4 hours).");
}
```

- [ ] **Step 2: Initialize app from root layout**

Modify `src/app/layout.tsx` — add at the top of the file, before the component:
```ts
import { initializeApp } from "@/lib/cron";

if (process.env.NEXT_RUNTIME !== "edge") {
  initializeApp();
}
```

This ensures the cron job starts when the Next.js server boots, but only on the server side.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add cron scheduler and app initialization with database seeding"
```

---

## Chunk 4: TV Display

### File Structure (Chunk 4)

```
src/app/tv/
├── page.tsx                      # TV display page
└── components/
    ├── EventTimeline.tsx          # Day-grouped event list
    ├── EventRow.tsx               # Single event row
    ├── DayHeader.tsx              # Day group header
    ├── ComingSoon.tsx             # Compact future events section
    └── ScoreBadge.tsx             # Color-coded score badge
```

### Task 10: TV display — score badge and event row components

**Files:**
- Create: `src/app/tv/components/ScoreBadge.tsx`, `src/app/tv/components/EventRow.tsx`, `src/app/tv/components/DayHeader.tsx`

- [ ] **Step 1: Create ScoreBadge component**

Create `src/app/tv/components/ScoreBadge.tsx`:
```tsx
interface ScoreBadgeProps {
  score: number;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  let colorClass = "bg-red-500 text-white";
  if (score >= 80) colorClass = "bg-green-500 text-black";
  else if (score >= 60) colorClass = "bg-blue-500 text-white";
  else if (score >= 40) colorClass = "bg-yellow-500 text-black";

  return (
    <span className={`${colorClass} text-xs font-bold px-2 py-0.5 rounded`}>
      {score}
    </span>
  );
}
```

- [ ] **Step 2: Create DayHeader component**

Create `src/app/tv/components/DayHeader.tsx`:
```tsx
interface DayHeaderProps {
  date: string; // YYYY-MM-DD
}

export function DayHeader({ date }: DayHeaderProps) {
  const d = new Date(date + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let label: string;
  if (d.toDateString() === today.toDateString()) {
    label = "Today";
  } else if (d.toDateString() === tomorrow.toDateString()) {
    label = "Tomorrow";
  } else {
    label = d.toLocaleDateString("en-US", { weekday: "long" });
  }

  const formatted = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="text-orange-500 font-bold text-sm uppercase tracking-widest py-3" data-day-header>
      {label} &mdash; {formatted}
    </div>
  );
}
```

- [ ] **Step 3: Create EventRow component**

Create `src/app/tv/components/EventRow.tsx`:
```tsx
import { ScoreBadge } from "./ScoreBadge";

interface EventRowProps {
  time: string | null;
  title: string;
  venue: string;
  distanceMiles: number | null;
  price: string | null;
  description: string | null;
  finalScore: number;
}

export function EventRow({
  time,
  title,
  venue,
  distanceMiles,
  price,
  description,
  finalScore,
}: EventRowProps) {
  let borderColor = "border-red-500";
  if (finalScore >= 80) borderColor = "border-green-500";
  else if (finalScore >= 60) borderColor = "border-blue-500";
  else if (finalScore >= 40) borderColor = "border-yellow-500";

  const distance = distanceMiles != null ? `${distanceMiles.toFixed(1)}mi` : null;

  return (
    <div className={`flex gap-3 p-3 bg-neutral-900 rounded-lg border-l-4 ${borderColor} mb-2`}>
      <div className="min-w-[50px] text-neutral-500 text-sm">
        {time ? formatTime(time) : "TBD"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white text-sm truncate">{title}</div>
        <div className="text-neutral-400 text-xs">
          {venue}
          {distance && ` · ${distance}`}
          {price && ` · ${price}`}
        </div>
        {description && (
          <div className="text-neutral-600 text-xs mt-1 line-clamp-2">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0 self-start">
        <ScoreBadge score={finalScore} />
      </div>
    </div>
  );
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "p" : "a";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")}${suffix}`;
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add TV display base components (ScoreBadge, DayHeader, EventRow)"
```

---

### Task 11: TV display — timeline and page

**Files:**
- Create: `src/app/tv/components/ComingSoon.tsx`, `src/app/tv/components/EventTimeline.tsx`, `src/app/tv/page.tsx`

- [ ] **Step 1: Create ComingSoon component**

Create `src/app/tv/components/ComingSoon.tsx`:
```tsx
import { ScoreBadge } from "./ScoreBadge";

interface ComingSoonEvent {
  date: string;
  title: string;
  finalScore: number;
}

interface ComingSoonProps {
  events: ComingSoonEvent[];
}

export function ComingSoon({ events }: ComingSoonProps) {
  if (events.length === 0) return null;

  return (
    <div className="border-t border-neutral-700 pt-4 mt-6">
      <div className="text-neutral-500 font-bold text-xs uppercase tracking-widest mb-3">
        Coming Up
      </div>
      {events.map((event, i) => {
        const d = new Date(event.date + "T12:00:00");
        const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return (
          <div key={i} className="flex justify-between items-center py-1.5 text-neutral-500 text-xs">
            <span>{formatted} · {event.title}</span>
            <ScoreBadge score={event.finalScore} />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create EventTimeline component**

Create `src/app/tv/components/EventTimeline.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import { DayHeader } from "./DayHeader";
import { EventRow } from "./EventRow";
import { ComingSoon } from "./ComingSoon";

interface Event {
  id: number;
  title: string;
  date: string;
  time: string | null;
  venue: string;
  distanceMiles: number | null;
  price: string | null;
  description: string | null;
  finalScore: number;
}

interface EventTimelineProps {
  events: Event[];
}

const SCROLL_SPEED = 0.5;       // pixels per frame
const DAY_PAUSE_MS = 10000;     // 10 seconds pause at each day header

export function EventTimeline({ events }: EventTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Group events by date
  const today = new Date().toISOString().split("T")[0];
  const fourteenDaysOut = new Date();
  fourteenDaysOut.setDate(fourteenDaysOut.getDate() + 14);
  const cutoff = fourteenDaysOut.toISOString().split("T")[0];

  const mainEvents = events.filter((e) => e.date <= cutoff);
  const futureEvents = events.filter((e) => e.date > cutoff);

  const grouped = new Map<string, Event[]>();
  for (const event of mainEvents) {
    const group = grouped.get(event.date) ?? [];
    group.push(event);
    grouped.set(event.date, group);
  }

  const sortedDates = [...grouped.keys()].sort();

  // Auto-scroll logic
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationId: number;
    let paused = false;
    let pauseTimeout: NodeJS.Timeout;

    const scroll = () => {
      if (!paused) {
        container.scrollTop += SCROLL_SPEED;

        // Check if we've reached the bottom
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
          paused = true;
          pauseTimeout = setTimeout(() => {
            container.scrollTop = 0;
            paused = false;
          }, DAY_PAUSE_MS);
        }

        // Check if a day header is at the top of the viewport
        const headers = container.querySelectorAll("[data-day-header]");
        headers.forEach((header) => {
          const rect = header.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          if (Math.abs(rect.top - containerRect.top) < 2 && !paused) {
            paused = true;
            pauseTimeout = setTimeout(() => {
              paused = false;
            }, DAY_PAUSE_MS);
          }
        });
      }

      animationId = requestAnimationFrame(scroll);
    };

    animationId = requestAnimationFrame(scroll);

    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(pauseTimeout);
    };
  }, [events]);

  return (
    <div ref={containerRef} className="h-screen overflow-hidden px-6 py-4">
      {sortedDates.map((date) => (
        <div key={date}>
          <DayHeader date={date} />
          {grouped.get(date)!.map((event) => (
            <EventRow
              key={event.id}
              time={event.time}
              title={event.title}
              venue={event.venue}
              distanceMiles={event.distanceMiles}
              price={event.price}
              description={event.description}
              finalScore={event.finalScore}
            />
          ))}
        </div>
      ))}

      <ComingSoon
        events={futureEvents.map((e) => ({
          date: e.date,
          title: e.title,
          finalScore: e.finalScore,
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create TV page**

Create `src/app/tv/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { EventTimeline } from "./components/EventTimeline";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface Event {
  id: number;
  title: string;
  date: string;
  time: string | null;
  venue: string;
  distanceMiles: number | null;
  price: string | null;
  description: string | null;
  finalScore: number;
}

export default function TVPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Failed to fetch events:", err);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* Header */}
      <div className="text-center py-4 border-b border-neutral-800">
        <h1 className="text-2xl font-bold">SF Events</h1>
        {lastUpdated && (
          <p className="text-xs text-neutral-500 mt-1">Updated {lastUpdated}</p>
        )}
      </div>

      {events.length === 0 ? (
        <div className="flex items-center justify-center h-[80vh]">
          <p className="text-neutral-500">No events yet. Trigger a scrape from the dashboard.</p>
        </div>
      ) : (
        <EventTimeline events={events} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create TV layout to set dark background**

Create `src/app/tv/layout.tsx`:
```tsx
export const metadata = {
  title: "SF Events — TV",
};

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-black min-h-screen">{children}</div>;
}
```

- [ ] **Step 5: Verify TV page renders**

Run: `npm run dev`
Visit: http://localhost:3000/tv
Expected: Dark screen with "SF Events" header and "No events yet" message.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add TV display with day-grouped timeline and auto-scroll"
```

---

## Chunk 5: Dashboard

### File Structure (Chunk 5)

```
src/app/dashboard/
├── page.tsx                       # Dashboard page (Events tab)
├── layout.tsx                     # Dashboard layout with nav tabs
├── sources/
│   └── page.tsx                   # Sources management tab
├── profile/
│   └── page.tsx                   # Profile management tab
└── components/
    ├── EventCard.tsx              # Interactive event card
    ├── FilterPills.tsx            # Filter pills (All, Today, This Week, Unrated)
    ├── DayGroup.tsx               # Day group wrapper for dashboard
    ├── SourceForm.tsx             # Add source form
    ├── SourceList.tsx             # Sources list with toggle/delete
    └── ProfileEditor.tsx          # Profile text editor + history
```

### Task 12: Dashboard layout and navigation

**Files:**
- Create: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Create dashboard layout with tabs**

Create `src/app/dashboard/layout.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Events", href: "/dashboard" },
  { label: "Sources", href: "/dashboard/sources" },
  { label: "Profile", href: "/dashboard/profile" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-extrabold tracking-tight">sf/events</h1>
          <nav className="flex gap-2">
            {TABS.map((tab) => {
              const isActive =
                tab.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add dashboard layout with tab navigation"
```

---

### Task 13: Dashboard — event cards and events page

**Files:**
- Create: `src/app/dashboard/components/EventCard.tsx`, `src/app/dashboard/components/FilterPills.tsx`, `src/app/dashboard/components/DayGroup.tsx`, `src/app/dashboard/page.tsx`

- [ ] **Step 1: Create EventCard component**

Create `src/app/dashboard/components/EventCard.tsx`:
```tsx
"use client";

import { useState } from "react";

interface EventCardProps {
  id: number;
  title: string;
  date: string;
  time: string | null;
  venue: string;
  distanceMiles: number | null;
  price: string | null;
  description: string | null;
  url: string | null;
  finalScore: number;
  interaction?: string | null;
  onInteract: (eventId: number, action: string) => void;
}

export function EventCard({
  id,
  title,
  date,
  time,
  venue,
  distanceMiles,
  price,
  description,
  url,
  finalScore,
  interaction,
  onInteract,
}: EventCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  let scoreColor = "bg-red-500 text-white";
  if (finalScore >= 80) scoreColor = "bg-green-500 text-black";
  else if (finalScore >= 60) scoreColor = "bg-blue-500 text-white";
  else if (finalScore >= 40) scoreColor = "bg-yellow-500 text-black";

  const distance = distanceMiles != null ? `${distanceMiles.toFixed(1)}mi` : null;
  const timeStr = time ? formatTime(time) : null;

  const handleThumbsDown = () => {
    onInteract(id, "thumbs_down");
    setDismissed(true);
  };

  const handleCalendar = () => {
    onInteract(id, "calendar_added");

    // Build Google Calendar URL
    const startDate = date.replace(/-/g, "");

    let dates: string;
    if (time) {
      // Timed event: use start time, assume 2-hour duration
      const [h, mins] = time.split(":").map(Number);
      const startTime = `${String(h).padStart(2, "0")}${String(mins).padStart(2, "0")}00`;
      const endH = Math.min(h + 2, 23);
      const endTime = `${String(endH).padStart(2, "0")}${String(mins).padStart(2, "0")}00`;
      dates = `${startDate}T${startTime}/${startDate}T${endTime}`;
    } else {
      // All-day event: end date must be the next day (exclusive)
      const nextDay = new Date(date + "T12:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      const endDate = nextDay.toISOString().split("T")[0].replace(/-/g, "");
      dates = `${startDate}/${endDate}`;
    }

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates,
      location: venue,
      details: `${description ?? ""}\n\n${url ?? ""}`.trim(),
      ctz: "America/Los_Angeles",
    });

    window.open(`https://calendar.google.com/calendar/render?${params}`, "_blank");
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {timeStr && `${timeStr} · `}
            {venue}
            {distance && ` · ${distance}`}
            {price && ` · ${price}`}
          </p>
        </div>
        <span className={`${scoreColor} text-xs font-bold px-2 py-0.5 rounded ml-2 flex-shrink-0`}>
          {finalScore}
        </span>
      </div>

      {description && (
        <p className="text-xs text-gray-400 mt-2">{description}</p>
      )}

      {interaction === "thumbs_down" ? (
        <p className="text-xs text-gray-400 mt-3 text-center">Marked not interested</p>
      ) : (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onInteract(id, "thumbs_up")}
            className={`flex-1 text-center py-2 rounded-md text-xs font-semibold transition-colors ${
              interaction === "thumbs_up"
                ? "bg-green-100 border border-green-300 text-green-700"
                : "bg-green-50 border border-green-200 text-green-600 hover:bg-green-100"
            }`}
          >
            {interaction === "thumbs_up" ? "Interested!" : "Interested"}
          </button>
          <button
            onClick={handleThumbsDown}
            className="flex-1 text-center py-2 bg-red-50 border border-red-200 rounded-md text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
          >
            Not for me
          </button>
          <button
            onClick={handleCalendar}
            className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-md text-xs hover:bg-gray-200 transition-colors"
          >
            📅
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${suffix}`;
}
```

- [ ] **Step 2: Create FilterPills component**

Create `src/app/dashboard/components/FilterPills.tsx`:
```tsx
interface FilterPillsProps {
  active: string;
  onChange: (filter: string) => void;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "unrated", label: "Unrated" },
];

export function FilterPills({ active, onChange }: FilterPillsProps) {
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      {FILTERS.map((filter) => (
        <button
          key={filter.key}
          onClick={() => onChange(filter.key)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            active === filter.key
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create DayGroup component**

Create `src/app/dashboard/components/DayGroup.tsx`:
```tsx
interface DayGroupProps {
  date: string;
  children: React.ReactNode;
}

export function DayGroup({ date, children }: DayGroupProps) {
  const d = new Date(date + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let label: string;
  if (d.toDateString() === today.toDateString()) {
    label = "Today";
  } else if (d.toDateString() === tomorrow.toDateString()) {
    label = "Tomorrow";
  } else {
    label = d.toLocaleDateString("en-US", { weekday: "long" });
  }

  const formatted = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mb-6">
      <h2 className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-3">
        {label} &mdash; {formatted}
      </h2>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Create dashboard events page**

Create `src/app/dashboard/page.tsx`:
```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { EventCard } from "./components/EventCard";
import { FilterPills } from "./components/FilterPills";
import { DayGroup } from "./components/DayGroup";

interface Event {
  id: number;
  title: string;
  date: string;
  time: string | null;
  venue: string;
  distanceMiles: number | null;
  price: string | null;
  description: string | null;
  url: string | null;
  finalScore: number;
  interaction: string | null;
}

export default function DashboardPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState("all");
  const [scraping, setScraping] = useState(false);

  const fetchEvents = useCallback(async () => {
    const res = await fetch(`/api/events?filter=${filter}`);
    const data = await res.json();
    setEvents(data);
  }, [filter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleInteract = async (eventId: number, action: string) => {
    await fetch("/api/events/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, action }),
    });

    // Update local state optimistically, then refetch
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, interaction: action } : e))
    );
  };

  const handleScrape = async () => {
    setScraping(true);
    try {
      await fetch("/api/scrape", { method: "POST" });
      await fetchEvents();
    } catch (err) {
      console.error("Scrape failed:", err);
    } finally {
      setScraping(false);
    }
  };

  // Group events by date
  const grouped = new Map<string, Event[]>();
  const displayEvents = events;

  for (const event of displayEvents) {
    const group = grouped.get(event.date) ?? [];
    group.push(event);
    grouped.set(event.date, group);
  }

  const sortedDates = [...grouped.keys()].sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <FilterPills active={filter} onChange={setFilter} />
        <button
          onClick={handleScrape}
          disabled={scraping}
          className="px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-800 disabled:opacity-50 flex-shrink-0"
        >
          {scraping ? "Scraping..." : "Scrape Now"}
        </button>
      </div>

      {sortedDates.length === 0 ? (
        <div className="text-center text-gray-400 py-20">
          <p className="text-sm">No events yet.</p>
          <p className="text-xs mt-1">Hit "Scrape Now" to discover events.</p>
        </div>
      ) : (
        sortedDates.map((date) => (
          <DayGroup key={date} date={date}>
            {grouped.get(date)!.map((event) => (
              <EventCard
                key={event.id}
                {...event}
                onInteract={handleInteract}
              />
            ))}
          </DayGroup>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify dashboard renders**

Run: `npm run dev`
Visit: http://localhost:3000/dashboard
Expected: Light-themed page with "sf/events" header, tab navigation (Events active), filter pills, "No events yet" message, and "Scrape Now" button.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add dashboard events page with cards, filters, and day grouping"
```

---

### Task 14: Dashboard — sources management

**Files:**
- Create: `src/app/dashboard/components/SourceForm.tsx`, `src/app/dashboard/components/SourceList.tsx`, `src/app/dashboard/sources/page.tsx`

- [ ] **Step 1: Create SourceForm component**

Create `src/app/dashboard/components/SourceForm.tsx`:
```tsx
"use client";

import { useState } from "react";

interface SourceFormProps {
  onAdd: () => void;
}

export function SourceForm({ onAdd }: SourceFormProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"platform" | "venue">("platform");
  const [url, setUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        url: type === "venue" ? url : undefined,
        searchQuery: type === "platform" ? searchQuery : undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      return;
    }

    setName("");
    setUrl("");
    setSearchQuery("");
    onAdd();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <h3 className="font-bold text-sm mb-3">Add Source</h3>

      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setType("platform")}
          className={`px-3 py-1 rounded text-xs font-medium ${
            type === "platform" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          Platform
        </button>
        <button
          type="button"
          onClick={() => setType("venue")}
          className={`px-3 py-1 rounded text-xs font-medium ${
            type === "venue" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          Venue
        </button>
      </div>

      <input
        type="text"
        placeholder="Source name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border border-gray-200 rounded px-3 py-2 text-sm mb-2"
        required
      />

      {type === "venue" ? (
        <input
          type="url"
          placeholder="Events page URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm mb-2"
          required
        />
      ) : (
        <input
          type="text"
          placeholder="Search query (e.g., 'events in SF site:meetup.com')"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm mb-2"
          required
        />
      )}

      {error && <p className="text-red-500 text-xs mb-2">{error}</p>}

      <button
        type="submit"
        className="w-full bg-gray-900 text-white rounded py-2 text-sm font-medium hover:bg-gray-800"
      >
        Add Source
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create SourceList component**

Create `src/app/dashboard/components/SourceList.tsx`:
```tsx
"use client";

interface Source {
  id: number;
  name: string;
  type: string;
  url: string | null;
  searchQuery: string | null;
  enabled: number;
  lastScrapedAt: string | null;
}

interface SourceListProps {
  sources: Source[];
  onToggle: (id: number, enabled: boolean) => void;
  onDelete: (id: number) => void;
}

export function SourceList({ sources, onToggle, onDelete }: SourceListProps) {
  return (
    <div className="space-y-2">
      {sources.map((source) => (
        <div
          key={source.id}
          className={`bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between ${
            !source.enabled ? "opacity-50" : ""
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{source.name}</span>
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">
                {source.type}
              </span>
            </div>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {source.url ?? source.searchQuery}
            </p>
            {source.lastScrapedAt && (
              <p className="text-xs text-gray-300 mt-0.5">
                Last scraped: {new Date(source.lastScrapedAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 ml-3">
            <button
              onClick={() => onToggle(source.id, !source.enabled)}
              className={`px-2 py-1 rounded text-xs font-medium ${
                source.enabled
                  ? "bg-green-50 text-green-600 border border-green-200"
                  : "bg-gray-100 text-gray-500 border border-gray-200"
              }`}
            >
              {source.enabled ? "On" : "Off"}
            </button>
            <button
              onClick={() => onDelete(source.id)}
              className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create sources page**

Create `src/app/dashboard/sources/page.tsx`:
```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { SourceForm } from "../components/SourceForm";
import { SourceList } from "../components/SourceList";

interface Source {
  id: number;
  name: string;
  type: string;
  url: string | null;
  searchQuery: string | null;
  enabled: number;
  lastScrapedAt: string | null;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);

  const fetchSources = useCallback(async () => {
    const res = await fetch("/api/sources");
    const data = await res.json();
    setSources(data);
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleToggle = async (id: number, enabled: boolean) => {
    await fetch("/api/sources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: enabled ? 1 : 0 }),
    });
    fetchSources();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/sources?id=${id}`, { method: "DELETE" });
    fetchSources();
  };

  return (
    <div>
      <SourceForm onAdd={fetchSources} />
      <h3 className="font-bold text-sm mb-3">Active Sources ({sources.length})</h3>
      <SourceList sources={sources} onToggle={handleToggle} onDelete={handleDelete} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add dashboard sources management page"
```

---

### Task 15: Dashboard — profile management

**Files:**
- Create: `src/app/dashboard/components/ProfileEditor.tsx`, `src/app/dashboard/profile/page.tsx`

- [ ] **Step 1: Create ProfileEditor component**

Create `src/app/dashboard/components/ProfileEditor.tsx`:
```tsx
"use client";

import { useState, useEffect } from "react";

interface ProfileEditorProps {
  initialText: string;
  version: number;
  onSave: (text: string) => void;
}

export function ProfileEditor({ initialText, version, onSave }: ProfileEditorProps) {
  const [text, setText] = useState(initialText);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setText(initialText);
    setDirty(false);
  }, [initialText]);

  const handleChange = (val: string) => {
    setText(val);
    setDirty(val !== initialText);
  };

  const handleSave = () => {
    onSave(text);
    setDirty(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm">Preference Profile</h3>
        <span className="text-xs text-gray-400">v{version}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full border border-gray-200 rounded px-3 py-2 text-sm h-40 resize-y"
      />
      <button
        onClick={handleSave}
        disabled={!dirty}
        className="mt-2 w-full bg-gray-900 text-white rounded py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-30"
      >
        Save Changes
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create profile page**

Create `src/app/dashboard/profile/page.tsx`:
```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { ProfileEditor } from "../components/ProfileEditor";

interface InteractionRecord {
  id: number;
  action: string;
  createdAt: string;
  eventTitle: string;
  eventVenue: string;
}

export default function ProfilePage() {
  const [profileText, setProfileText] = useState("");
  const [version, setVersion] = useState(0);
  const [history, setHistory] = useState<InteractionRecord[]>([]);

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/profile");
    const data = await res.json();
    if (data.profile) {
      setProfileText(data.profile.profileText);
      setVersion(data.profile.version);
    }
    setHistory(data.history ?? []);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async (text: string) => {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileText: text }),
    });
    const data = await res.json();
    if (data.version) setVersion(data.version);
  };

  return (
    <div>
      <ProfileEditor
        initialText={profileText}
        version={version}
        onSave={handleSave}
      />

      <h3 className="font-bold text-sm mb-3">Interaction History</h3>
      {history.length === 0 ? (
        <p className="text-gray-400 text-xs">No interactions yet.</p>
      ) : (
        <div className="space-y-2">
          {history.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2">
                <span>
                  {item.action === "thumbs_up" && "👍"}
                  {item.action === "thumbs_down" && "👎"}
                  {item.action === "calendar_added" && "📅"}
                </span>
                <span className="font-medium">{item.eventTitle}</span>
                <span className="text-gray-400 text-xs">at {item.eventVenue}</span>
              </div>
              <p className="text-xs text-gray-300 mt-1">
                {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify all dashboard tabs work**

Run: `npm run dev`
Visit: http://localhost:3000/dashboard — Events tab with empty state
Visit: http://localhost:3000/dashboard/sources — Sources tab with add form
Visit: http://localhost:3000/dashboard/profile — Profile tab with editor
Expected: All three tabs render without errors. Navigation between tabs works.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add dashboard profile management and interaction history"
```

---

## Chunk 6: Integration Testing & Polish

### Task 16: End-to-end smoke test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify seed data loaded**

Visit: http://localhost:3000/dashboard/sources
Expected: 9 sources listed (7 platform, 2 venue), all enabled.

Visit: http://localhost:3000/dashboard/profile
Expected: Seed preference profile text is displayed.

- [ ] **Step 3: Trigger a manual scrape**

Visit: http://localhost:3000/dashboard
Click "Scrape Now" button.
Watch server console for scrape logs.
Expected: Events start appearing grouped by day with scores. (Requires valid `ANTHROPIC_API_KEY` in `.env.local`.)

- [ ] **Step 4: Test interactions**

On the dashboard, click "Interested" on one event and "Not for me" on another.
Visit: http://localhost:3000/dashboard/profile
Expected: Both interactions show in the history.

- [ ] **Step 5: Test TV display**

Visit: http://localhost:3000/tv
Expected: Dark-themed display showing the same events, grouped by day, with auto-scroll behavior.

- [ ] **Step 6: Test adding a source**

Visit: http://localhost:3000/dashboard/sources
Add a new venue source (e.g., "The Chapel" / "https://www.thechapelsf.com/calendar").
Expected: Source appears in the list. Toggle on/off and delete work.

- [ ] **Step 7: Test Google Calendar**

On the dashboard, click the 📅 button on an event.
Expected: Google Calendar opens in a new tab with event details pre-filled.

- [ ] **Step 8: Commit any fixes (if needed)**

If any changes were made during smoke testing:
```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
If no changes were needed, skip this step.

---

### Task 17: GitHub repository

- [ ] **Step 1: Create private GitHub repo**

```bash
gh repo create sf-events --private --source=. --push
```

Expected: Private repo created and code pushed.

- [ ] **Step 2: Verify repo on GitHub**

Run: `gh repo view sf-events --web`
Expected: Browser opens to the private repo with all committed code.
