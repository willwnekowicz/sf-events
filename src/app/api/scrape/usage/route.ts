import { NextResponse } from "next/server";
import { getAllTimeUsage } from "@/lib/scraper/job-report";
import { getAccountInfo } from "@/lib/brightdata";

export const dynamic = "force-dynamic";

/** All-time Bright Data spend + live account balance/status — the cost monitor. */
export async function GET() {
  const [usage, account] = await Promise.all([getAllTimeUsage(), getAccountInfo()]);
  return NextResponse.json({ usage, account });
}
