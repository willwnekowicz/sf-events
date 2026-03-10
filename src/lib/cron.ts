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
