import { db } from "@/db";
import { scrapeJobs, scrapeRuns, scrapeRunEvents, scrapeBdCalls, sources } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface ProductUsage {
  product: string;
  calls: number;
  okCalls: number;
  credits: number;
  costUsd: number;
  bytes: number;
}

async function usageByProduct(where: ReturnType<typeof eq> | undefined): Promise<ProductUsage[]> {
  const q = db
    .select({
      product: scrapeBdCalls.product,
      calls: sql<number>`count(*)`,
      okCalls: sql<number>`sum(case when ${scrapeBdCalls.ok} = 1 then 1 else 0 end)`,
      credits: sql<number>`coalesce(sum(${scrapeBdCalls.credits}), 0)`,
      costUsd: sql<number>`coalesce(sum(${scrapeBdCalls.costUsd}), 0)`,
      bytes: sql<number>`coalesce(sum(${scrapeBdCalls.bytes}), 0)`,
    })
    .from(scrapeBdCalls)
    .groupBy(scrapeBdCalls.product);
  const rows = where ? await q.where(where) : await q;
  return rows.map((r) => ({
    product: r.product,
    calls: Number(r.calls),
    okCalls: Number(r.okCalls),
    credits: Number(r.credits),
    costUsd: Number(r.costUsd),
    bytes: Number(r.bytes),
  }));
}

const RUN_FIELDS = {
  id: scrapeRuns.id,
  jobId: scrapeRuns.jobId,
  sourceId: scrapeRuns.sourceId,
  sourceName: sources.name,
  status: scrapeRuns.status,
  method: scrapeRuns.method,
  stage: scrapeRuns.stage,
  eventsFound: scrapeRuns.eventsFound,
  extractedCount: scrapeRuns.extractedCount,
  insertedCount: scrapeRuns.insertedCount,
  dedupedCount: scrapeRuns.dedupedCount,
  httpStatus: scrapeRuns.httpStatus,
  contentBytes: scrapeRuns.contentBytes,
  costCredits: scrapeRuns.costCredits,
  costUsd: scrapeRuns.costUsd,
  errorMessage: scrapeRuns.errorMessage,
  startedAt: scrapeRuns.startedAt,
  finishedAt: scrapeRuns.finishedAt,
  durationMs: scrapeRuns.durationMs,
};

/** Everything the dashboard needs to render one job: header, per-source runs, usage. */
export async function getJobBundle(jobId: number) {
  const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, jobId));
  if (!job) return null;
  const runs = await db
    .select(RUN_FIELDS)
    .from(scrapeRuns)
    .innerJoin(sources, eq(scrapeRuns.sourceId, sources.id))
    .where(eq(scrapeRuns.jobId, jobId))
    .orderBy(desc(scrapeRuns.startedAt));
  const usage = await usageByProduct(eq(scrapeBdCalls.jobId, jobId));
  return { job, runs, usage };
}

export async function getLatestJobBundle() {
  const [latest] = await db.select({ id: scrapeJobs.id }).from(scrapeJobs).orderBy(desc(scrapeJobs.id)).limit(1);
  if (!latest) return null;
  return getJobBundle(latest.id);
}

export async function listJobs(limit = 25) {
  return db.select().from(scrapeJobs).orderBy(desc(scrapeJobs.id)).limit(limit);
}

/** Run drill-down: the run row, the events it surfaced, and its Bright Data calls. */
export async function getRunDetail(runId: number) {
  const [run] = await db
    .select(RUN_FIELDS)
    .from(scrapeRuns)
    .innerJoin(sources, eq(scrapeRuns.sourceId, sources.id))
    .where(eq(scrapeRuns.id, runId));
  if (!run) return null;
  const runEvents = await db
    .select()
    .from(scrapeRunEvents)
    .where(eq(scrapeRunEvents.runId, runId))
    .orderBy(desc(scrapeRunEvents.id));
  const bdCalls = await db
    .select()
    .from(scrapeBdCalls)
    .where(eq(scrapeBdCalls.runId, runId))
    .orderBy(scrapeBdCalls.id);
  return { run, events: runEvents, bdCalls };
}

/** All-time Bright Data spend, for the cost monitor. */
export async function getAllTimeUsage() {
  const byProduct = await usageByProduct(undefined);
  const totals = byProduct.reduce(
    (acc, p) => {
      acc.calls += p.calls;
      acc.credits += p.credits;
      acc.costUsd += p.costUsd;
      return acc;
    },
    { calls: 0, credits: 0, costUsd: 0 }
  );
  return { byProduct, totals };
}
