import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scrapeRuns, sources } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sourceId = searchParams.get("sourceId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

  // Per-source rollup view
  if (searchParams.get("summary") === "1") {
    const allSources = await db.select().from(sources);
    const latestRows = await db
      .select({
        sourceId: scrapeRuns.sourceId,
        status: scrapeRuns.status,
        eventsFound: scrapeRuns.eventsFound,
        errorMessage: scrapeRuns.errorMessage,
        startedAt: scrapeRuns.startedAt,
        finishedAt: scrapeRuns.finishedAt,
        durationMs: scrapeRuns.durationMs,
      })
      .from(scrapeRuns)
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(2000);

    const latestBySource = new Map<number, (typeof latestRows)[number]>();
    for (const row of latestRows) {
      if (!latestBySource.has(row.sourceId)) latestBySource.set(row.sourceId, row);
    }

    const summary = allSources.map((s) => {
      const recent = latestRows.filter((r) => r.sourceId === s.id).slice(0, 30);
      const totalEvents = recent.reduce((sum, r) => sum + (r.eventsFound ?? 0), 0);
      const errorCount = recent.filter((r) => r.status === "error").length;
      const successCount = recent.filter((r) => r.status === "success").length;
      const emptyCount = recent.filter((r) => r.status === "empty").length;
      return {
        source: s,
        latest: latestBySource.get(s.id) ?? null,
        recentRuns: recent.length,
        totalEvents,
        errorCount,
        successCount,
        emptyCount,
      };
    });

    return NextResponse.json(summary);
  }

  // Run history (optionally filtered by source)
  const rows = sourceId
    ? await db
        .select({
          id: scrapeRuns.id,
          sourceId: scrapeRuns.sourceId,
          sourceName: sources.name,
          status: scrapeRuns.status,
          eventsFound: scrapeRuns.eventsFound,
          errorMessage: scrapeRuns.errorMessage,
          startedAt: scrapeRuns.startedAt,
          finishedAt: scrapeRuns.finishedAt,
          durationMs: scrapeRuns.durationMs,
        })
        .from(scrapeRuns)
        .innerJoin(sources, eq(scrapeRuns.sourceId, sources.id))
        .where(eq(scrapeRuns.sourceId, parseInt(sourceId)))
        .orderBy(desc(scrapeRuns.startedAt))
        .limit(limit)
    : await db
        .select({
          id: scrapeRuns.id,
          sourceId: scrapeRuns.sourceId,
          sourceName: sources.name,
          status: scrapeRuns.status,
          eventsFound: scrapeRuns.eventsFound,
          errorMessage: scrapeRuns.errorMessage,
          startedAt: scrapeRuns.startedAt,
          finishedAt: scrapeRuns.finishedAt,
          durationMs: scrapeRuns.durationMs,
        })
        .from(scrapeRuns)
        .innerJoin(sources, eq(scrapeRuns.sourceId, sources.id))
        .orderBy(desc(scrapeRuns.startedAt))
        .limit(limit);

  return NextResponse.json(rows);
}
