import { NextResponse } from "next/server";
import { startScrapeJob, isScrapeRunning } from "@/lib/scraper/pipeline";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Kicks off a scrape cycle in the background and returns its jobId immediately.
 * The dashboard polls /api/scrape/jobs/[id] for live progress.
 */
export async function POST() {
  if (isScrapeRunning()) {
    return NextResponse.json({ error: "Scrape already in progress" }, { status: 409 });
  }
  try {
    const jobId = await startScrapeJob("manual");
    return NextResponse.json({ jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/scrape] Error:", err);
    return NextResponse.json({ error: "Scrape failed to start", message }, { status: 500 });
  }
}
