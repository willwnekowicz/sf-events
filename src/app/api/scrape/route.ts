import { NextResponse } from "next/server";
import { runScrapeCycle } from "@/lib/scraper/pipeline";

export const maxDuration = 800; // seconds — give the cycle plenty of headroom
export const dynamic = "force-dynamic";

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
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/scrape] Error:", err);
    return NextResponse.json(
      { error: "Scrape failed", message },
      { status: 500 }
    );
  } finally {
    isRunning = false;
  }
}
