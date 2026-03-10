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
