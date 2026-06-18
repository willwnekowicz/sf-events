"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types (mirror the API responses)
// ---------------------------------------------------------------------------
interface Account {
  configured: boolean;
  balance: number | null;
  pendingCosts: number | null;
  status: string | null;
  canMakeRequests: boolean | null;
  customerId: string | null;
  error: string | null;
}
interface ProductUsage {
  product: string;
  calls: number;
  okCalls: number;
  credits: number;
  costUsd: number;
  bytes: number;
}
interface Job {
  id: number;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  totalSources: number;
  completedSources: number;
  totalFound: number;
  totalInserted: number;
  totalErrors: number;
  totalCredits: number;
  totalCostUsd: number;
  errorMessage: string | null;
}
interface Run {
  id: number;
  sourceName: string;
  status: string;
  method: string | null;
  stage: string | null;
  eventsFound: number;
  extractedCount: number;
  insertedCount: number;
  dedupedCount: number;
  httpStatus: number | null;
  contentBytes: number | null;
  costCredits: number;
  costUsd: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}
interface Bundle {
  job: Job;
  runs: Run[];
  usage: ProductUsage[];
}
interface UsageResp {
  usage: { byProduct: ProductUsage[]; totals: { calls: number; credits: number; costUsd: number } };
  account: Account;
}
interface RunEvent {
  id: number;
  title: string;
  url: string | null;
  date: string | null;
  venue: string | null;
  status: string;
}
interface BdCall {
  id: number;
  product: string;
  operation: string | null;
  url: string | null;
  httpStatus: number | null;
  bytes: number | null;
  credits: number;
  costUsd: number;
  durationMs: number | null;
  ok: number;
  errorMessage: string | null;
  createdAt: string;
}
interface RunDetail {
  run: Run;
  events: RunEvent[];
  bdCalls: BdCall[];
}

// ---------------------------------------------------------------------------
// Bright Data product metadata
// ---------------------------------------------------------------------------
const PRODUCTS: Record<string, { label: string; cls: string; bar: string; blurb: string }> = {
  web_unlocker: { label: "Web Unlocker", cls: "bg-indigo-100 text-indigo-700 border-indigo-200", bar: "bg-indigo-500", blurb: "Unblocks bot-protected pages" },
  serp: { label: "SERP API", cls: "bg-teal-100 text-teal-700 border-teal-200", bar: "bg-teal-500", blurb: "Structured search results" },
  scraping_browser: { label: "Scraping Browser", cls: "bg-purple-100 text-purple-700 border-purple-200", bar: "bg-purple-500", blurb: "JS-rendered pages over CDP" },
  web_data: { label: "Web Data", cls: "bg-blue-100 text-blue-700 border-blue-200", bar: "bg-blue-500", blurb: "Structured dataset records" },
  direct_fetch: { label: "Direct fetch", cls: "bg-gray-100 text-gray-600 border-gray-200", bar: "bg-gray-400", blurb: "Plain HTTP GET — no Bright Data, $0" },
};
function productKey(method: string | null): string {
  if (!method) return "web_unlocker";
  if (method.startsWith("web_data")) return "web_data";
  return method;
}
function productMeta(method: string | null) {
  return PRODUCTS[productKey(method)] ?? { label: method ?? "—", cls: "bg-gray-100 text-gray-600 border-gray-200", bar: "bg-gray-400", blurb: "" };
}

const STATUS_COLORS: Record<string, string> = {
  success: "bg-green-50 text-green-700 border-green-200",
  inserted: "bg-green-50 text-green-700 border-green-200",
  empty: "bg-yellow-50 text-yellow-700 border-yellow-200",
  duplicate: "bg-gray-50 text-gray-500 border-gray-200",
  extracted: "bg-blue-50 text-blue-700 border-blue-200",
  error: "bg-red-50 text-red-700 border-red-200",
  running: "bg-blue-50 text-blue-700 border-blue-200 animate-pulse",
  queued: "bg-gray-50 text-gray-500 border-gray-200",
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
function fmtBytes(n: number | null | undefined): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDur(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ScrapeStatusPage() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [usageResp, setUsageResp] = useState<UsageResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, RunDetail>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    const [jobRes, useRes] = await Promise.all([
      fetch("/api/scrape/jobs?latest=1").then((r) => r.json()),
      fetch("/api/scrape/usage").then((r) => r.json()),
    ]);
    setBundle(jobRes as Bundle | null);
    setUsageResp(useRes as UsageResp);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Tick a clock every second for the elapsed timer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-poll while a job is running.
  const jobRunning = bundle?.job?.status === "running";
  useEffect(() => {
    if (jobRunning && !pollRef.current) {
      pollRef.current = setInterval(fetchAll, 1500);
    } else if (!jobRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      fetchAll(); // final refresh
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobRunning, fetchAll]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(`Scrape failed: ${data.message ?? data.error ?? res.statusText}`);
      await fetchAll();
    } finally {
      setRunning(false);
    }
  };

  const toggleRun = async (runId: number) => {
    if (expanded === runId) {
      setExpanded(null);
      return;
    }
    setExpanded(runId);
    if (!details[runId]) {
      const d = (await fetch(`/api/scrape/runs/${runId}`).then((r) => r.json())) as RunDetail;
      setDetails((prev) => ({ ...prev, [runId]: d }));
    }
  };

  const job = bundle?.job ?? null;
  // Sort sources by events found (most productive first); tiebreak on new/name.
  const runs = (bundle?.runs ?? [])
    .slice()
    .sort(
      (a, b) =>
        b.extractedCount - a.extractedCount ||
        b.insertedCount - a.insertedCount ||
        a.sourceName.localeCompare(b.sourceName)
    );
  const account = usageResp?.account;

  return (
    <div className="space-y-4">
      {/* ---- Cost monitor ---- */}
      <CostMonitor account={account} usage={usageResp?.usage} />

      {/* ---- Action row ---- */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Scrape Status</h2>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="px-3 py-1.5 rounded text-xs font-medium bg-gray-100 hover:bg-gray-200">
            Refresh
          </button>
          <button
            onClick={handleRun}
            disabled={running || jobRunning}
            className="px-3 py-1.5 rounded text-xs font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {running || jobRunning ? "Running…" : "Run scrape now"}
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {/* ---- Live job header ---- */}
      {job && <JobHeader job={job} now={now} />}

      {/* ---- Bright Data usage for this job ---- */}
      {bundle && bundle.usage.length > 0 && <UsagePanel usage={bundle.usage} title="Bright Data usage · this run" />}

      {/* ---- Per-source runs ---- */}
      <div className="space-y-2">
        {runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            expanded={expanded === run.id}
            detail={details[run.id]}
            onToggle={() => toggleRun(run.id)}
          />
        ))}
        {!loading && runs.length === 0 && (
          <p className="text-sm text-gray-400">No runs yet. Click “Run scrape now” to start a cycle.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cost monitor
// ---------------------------------------------------------------------------
function CostMonitor({ account, usage }: { account?: Account; usage?: UsageResp["usage"] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Bright Data · cost monitor</span>
        {account?.customerId && <span className="text-[10px] text-gray-400 font-mono">{account.customerId}</span>}
      </div>

      {!account?.configured && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Bright Data not configured — set BRIGHTDATA_API_TOKEN in .env.local.
        </p>
      )}

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Balance" value={account?.balance != null ? `$${account.balance.toFixed(2)}` : "—"} />
        <Stat label="All-time spend" value={fmtUsd(usage?.totals.costUsd)} accent />
        <Stat label="Credits used" value={usage ? Math.round(usage.totals.credits).toLocaleString() : "—"} />
        <Stat label="Total calls" value={usage ? usage.totals.calls.toLocaleString() : "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className={`text-lg font-bold tabular-nums ${accent ? "text-emerald-600" : "text-gray-900"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live job header
// ---------------------------------------------------------------------------
function JobHeader({ job, now }: { job: Job; now: number }) {
  const pct = job.totalSources > 0 ? Math.round((job.completedSources / job.totalSources) * 100) : 0;
  const endMs = job.finishedAt ? new Date(job.finishedAt).getTime() : now;
  const elapsed = endMs - new Date(job.startedAt).getTime();
  const isRunning = job.status === "running";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase ${STATUS_COLORS[job.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
            {isRunning && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 animate-pulse" />}
            {job.status}
          </span>
          <span className="text-xs text-gray-500">
            Job #{job.id} · {job.trigger} · {fmtTime(job.startedAt)}
          </span>
        </div>
        <span className="text-xs font-mono text-gray-500 tabular-nums">{fmtClock(elapsed)}</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full transition-all ${isRunning ? "bg-blue-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-5 gap-2 text-center">
        <MiniStat label="Sources" value={`${job.completedSources}/${job.totalSources}`} />
        <MiniStat label="Found" value={job.totalFound} />
        <MiniStat label="Inserted" value={job.totalInserted} accent="text-emerald-600" />
        <MiniStat label="Errors" value={job.totalErrors} accent={job.totalErrors > 0 ? "text-red-600" : undefined} />
        <MiniStat label="Cost" value={fmtUsd(job.totalCostUsd)} accent="text-emerald-600" />
      </div>

      {job.errorMessage && <p className="text-xs text-red-600 mt-2">⚠ {job.errorMessage}</p>}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div>
      <div className={`text-sm font-bold tabular-nums ${accent ?? "text-gray-900"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bright Data usage panel (per-product cards)
// ---------------------------------------------------------------------------
function UsagePanel({ usage, title }: { usage: ProductUsage[]; title: string }) {
  const order = ["web_unlocker", "serp", "scraping_browser", "web_data", "direct_fetch"];
  const byKey = new Map(usage.map((u) => [u.product, u]));
  const products = order.filter((k) => byKey.has(k));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        {products.map((key) => {
          const u = byKey.get(key)!;
          const meta = PRODUCTS[key];
          const failed = u.calls - u.okCalls;
          return (
            <div key={key} className={`rounded-lg border p-3 ${meta.cls}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{meta.label}</span>
                <span className="text-sm font-bold tabular-nums">{fmtUsd(u.costUsd)}</span>
              </div>
              <div className="text-[10px] opacity-80 mt-0.5">{meta.blurb}</div>
              <div className="flex gap-3 mt-2 text-[11px] tabular-nums">
                <span>{u.calls} calls{failed > 0 ? ` · ${failed} failed` : ""}</span>
                <span>{Math.round(u.credits)} cr</span>
                <span>{fmtBytes(u.bytes)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-source run card (+ drill-down)
// ---------------------------------------------------------------------------
function RunCard({ run, expanded, detail, onToggle }: { run: Run; expanded: boolean; detail?: RunDetail; onToggle: () => void }) {
  const meta = productMeta(run.method);
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="p-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="font-medium text-sm">{run.sourceName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${meta.cls}`}>{meta.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase ${STATUS_COLORS[run.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
              {run.status === "running" && run.stage ? run.stage : run.status}
            </span>
          </div>
          <span className="text-gray-400 text-xs">{expanded ? "▾" : "▸"}</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500 tabular-nums flex-wrap">
          <span>
            <strong className="text-gray-700">{run.extractedCount}</strong> found
            {run.insertedCount > 0 && <span className="text-emerald-600"> · {run.insertedCount} new</span>}
            {run.dedupedCount > 0 && <span className="text-gray-400"> · {run.dedupedCount} dup</span>}
          </span>
          <span>{fmtDur(run.durationMs)}</span>
          <span className="text-emerald-600">{fmtUsd(run.costUsd)}</span>
          {run.httpStatus != null && <span>HTTP {run.httpStatus}</span>}
          {run.contentBytes != null && <span>{fmtBytes(run.contentBytes)}</span>}
        </div>
        {run.status === "error" && run.errorMessage && (
          <p className="text-xs text-red-600 mt-1 line-clamp-2">⚠ {run.errorMessage}</p>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-3">
          {!detail && <p className="text-xs text-gray-400">Loading detail…</p>}
          {detail && (
            <>
              {/* Bright Data calls */}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Bright Data calls</div>
                {detail.bdCalls.length === 0 ? (
                  <p className="text-xs text-gray-400">No calls recorded.</p>
                ) : (
                  <div className="space-y-1">
                    {detail.bdCalls.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-[11px]">
                        <span className={`px-1.5 py-0.5 rounded border font-medium ${PRODUCTS[c.product]?.cls ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                          {PRODUCTS[c.product]?.label ?? c.product}
                        </span>
                        <span className={c.ok ? "text-gray-500" : "text-red-600"}>{c.operation}</span>
                        <span className="text-gray-400 truncate flex-1 min-w-0">{c.url}</span>
                        <span className="text-gray-500 tabular-nums">{fmtDur(c.durationMs)}</span>
                        <span className="text-emerald-600 tabular-nums">{fmtUsd(c.costUsd)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Events surfaced */}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                  Events surfaced ({detail.events.length})
                </div>
                {detail.events.length === 0 ? (
                  <p className="text-xs text-gray-400">None.</p>
                ) : (
                  <div className="space-y-1">
                    {detail.events.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 text-[11px]">
                        <span className={`px-1.5 py-0.5 rounded border font-medium uppercase ${STATUS_COLORS[e.status] ?? ""}`}>{e.status}</span>
                        <span className="font-medium text-gray-700 truncate">{e.title}</span>
                        <span className="text-gray-400 whitespace-nowrap">{e.date}</span>
                        {e.url && (
                          <a href={e.url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} className="text-blue-600 hover:underline">
                            link
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detail.run.errorMessage && (
                <pre className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded p-2 whitespace-pre-wrap break-words">{detail.run.errorMessage}</pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
