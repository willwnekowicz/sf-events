import { NextRequest, NextResponse } from "next/server";
import { getLatestJobBundle, getJobBundle, listJobs } from "@/lib/scraper/job-report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const id = searchParams.get("id");
  if (id) {
    const bundle = await getJobBundle(parseInt(id));
    if (!bundle) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json(bundle);
  }

  if (searchParams.get("latest") === "1") {
    const bundle = await getLatestJobBundle();
    return NextResponse.json(bundle ?? null);
  }

  const limit = Math.min(parseInt(searchParams.get("limit") ?? "25"), 100);
  return NextResponse.json(await listJobs(limit));
}
