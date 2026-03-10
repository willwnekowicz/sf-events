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
});

export const interactions = sqliteTable("interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull().references(() => events.id),
  action: text("action").notNull(),
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
