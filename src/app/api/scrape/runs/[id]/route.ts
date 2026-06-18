import { NextRequest, NextResponse } from "next/server";
import { getRunDetail } from "@/lib/scraper/job-report";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getRunDetail(parseInt(id));
  if (!detail) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json(detail);
}
