import cron from "node-cron";
import { runScrapeCycle } from "@/lib/scraper/pipeline";
import { seedDatabase } from "@/db/seed";

// Use globalThis so HMR module reloads don't register multiple cron tasks.
const G = globalThis as unknown as {
  __sfEventsInitialized?: boolean;
  __sfEventsCronTask?: ReturnType<typeof cron.schedule>;
};

export function initializeApp() {
  if (G.__sfEventsInitialized) return;
  G.__sfEventsInitialized = true;

  // Seed database on first run
  seedDatabase().then(() => {
    console.log("[init] Database seeded (if needed).");
  });

  // Stop any prior cron task lingering from a previous module instance
  if (G.__sfEventsCronTask) {
    try {
      G.__sfEventsCronTask.stop();
    } catch {
      /* noop */
    }
  }

  // Run scrape cycle every 4 hours
  G.__sfEventsCronTask = cron.schedule("0 */4 * * *", async () => {
    console.log("[cron] Triggering scheduled scrape cycle...");
    try {
      await runScrapeCycle();
    } catch (err) {
      console.error("[cron] Scrape cycle error:", err);
    }
  });

  console.log("[init] Cron scheduler started (every 4 hours).");
}
