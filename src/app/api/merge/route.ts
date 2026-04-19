import { NextResponse } from "next/server";
import { mergeExistingEvents } from "@/lib/scraper/merge-events";

export async function POST() {
  try {
    await mergeExistingEvents();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/merge] Error:", err);
    return NextResponse.json({ error: "Merge failed" }, { status: 500 });
  }
}
