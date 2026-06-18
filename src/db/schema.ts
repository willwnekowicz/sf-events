import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  date: text("date").notNull(),
  time: text("time"),
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
  type: text("type").notNull(),
  url: text("url"),
  searchQuery: text("search_query"),
  enabled: integer("enabled").notNull().default(1),
  lastScrapedAt: text("last_scraped_at"),
  // Which Bright Data product fetches this source:
  // 'web_unlocker' | 'serp' | 'scraping_browser' | 'web_data_facebook_events'
  method: text("method"),
  // Ask Web Unlocker / browser to fully render JS before returning (1 = yes).
  render: integer("render").notNull().default(0),
});

export const interactions = sqliteTable("interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull().references(() => events.id),
  action: text("action").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
});

export const preferenceProfile = sqliteTable("preference_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileText: text("profile_text").notNull(),
  version: integer("version").notNull(),
  createdAt: text("created_at").notNull(),
});

// A full scrape cycle (one click of "Run scrape now", or one cron tick).
export const scrapeJobs = sqliteTable("scrape_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trigger: text("trigger").notNull(), // 'manual' | 'cron'
  status: text("status").notNull(), // 'running' | 'done' | 'error' | 'canceled'
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  totalSources: integer("total_sources").notNull().default(0),
  completedSources: integer("completed_sources").notNull().default(0),
  totalFound: integer("total_found").notNull().default(0),
  totalInserted: integer("total_inserted").notNull().default(0),
  totalErrors: integer("total_errors").notNull().default(0),
  totalCredits: real("total_credits").notNull().default(0),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  errorMessage: text("error_message"),
});

export const scrapeRuns = sqliteTable("scrape_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").references(() => scrapeJobs.id),
  sourceId: integer("source_id").notNull().references(() => sources.id),
  status: text("status").notNull(), // 'queued' | 'running' | 'success' | 'error' | 'empty'
  method: text("method"), // primary Bright Data product for this run
  stage: text("stage"), // live stage label while running (e.g. 'fetching', 'extracting')
  eventsFound: integer("events_found").notNull().default(0),
  extractedCount: integer("extracted_count").notNull().default(0),
  insertedCount: integer("inserted_count").notNull().default(0),
  dedupedCount: integer("deduped_count").notNull().default(0),
  httpStatus: integer("http_status"),
  contentBytes: integer("content_bytes"),
  costCredits: real("cost_credits").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  durationMs: integer("duration_ms"),
});

// The actual events a run surfaced — powers the drill-down "what did this find".
export const scrapeRunEvents = sqliteTable("scrape_run_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull().references(() => scrapeRuns.id),
  jobId: integer("job_id").references(() => scrapeJobs.id),
  title: text("title").notNull(),
  url: text("url"),
  date: text("date"),
  venue: text("venue"),
  status: text("status").notNull(), // 'extracted' | 'inserted' | 'duplicate'
});

// One row per individual Bright Data API call — the audit trail that powers the
// per-product usage panel (a SERP source makes both SERP and Web Unlocker calls).
export const scrapeBdCalls = sqliteTable("scrape_bd_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").references(() => scrapeJobs.id),
  runId: integer("run_id").references(() => scrapeRuns.id),
  product: text("product").notNull(), // 'web_unlocker' | 'serp' | 'scraping_browser' | 'web_data'
  operation: text("operation"), // 'unlock' | 'search' | 'facebook_events' | ...
  url: text("url"),
  httpStatus: integer("http_status"),
  bytes: integer("bytes"),
  credits: real("credits").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  durationMs: integer("duration_ms"),
  ok: integer("ok").notNull().default(1),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
});

// Outbound voice calls placed about hot (high-scoring) events. The LiveKit agent
// summarizes the event by phone and captures which friends might want to go.
export const eventCalls = sqliteTable("event_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").references(() => events.id),
  phone: text("phone").notNull(),
  status: text("status").notNull(), // 'initiated' | 'ringing' | 'in_progress' | 'completed' | 'failed'
  roomName: text("room_name"),
  eventTitle: text("event_title").notNull(),
  eventSummary: text("event_summary"),
  score: integer("score"),
  friends: text("friends"), // JSON array of names captured on the call
  transcript: text("transcript"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
});

export const geocodeCache = sqliteTable("geocode_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address").notNull().unique(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
});
