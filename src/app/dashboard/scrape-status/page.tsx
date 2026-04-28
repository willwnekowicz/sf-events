"use client";

import { useEffect, useState, useCallback } from "react";

interface Source {
  id: number;
  name: string;
  type: string;
  url: string | null;
  searchQuery: string | null;
  enabled: number;
  lastScrapedAt: string | null;
}

interface LatestRun {
  sourceId: number;
  status: string;
  eventsFound: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

interface SummaryRow {
  source: Source;
  latest: LatestRun | null;
  recentRuns: number;
  totalEvents: number;
  errorCount: number;
  successCount: number;
  emptyCount: number;
}

interface RunRow {
  id: number;
  sourceId: number;
  sourceName: string;
  status: string;
  eventsFound: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  success: "bg-green-50 text-green-700 border-green-200",
  empty: "bg-yellow-50 text-yellow-700 border-yellow-200",
  error: "bg-red-50 text-red-700 border-red-200",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

export default function ScrapeStatusPage() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [sumRes, runsRes] = await Promise.all([
      fetch("/api/scrape/runs?summary=1"),
      fetch("/api/scrape/runs?limit=100"),
    ]);
    setSummary(await sumRes.json());
    setRuns(await runsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Scrape failed: ${data.message ?? data.error ?? res.statusText}`);
      }
      await fetchData();
    } finally {
      setRunning(false);
    }
  };

  const totals = summary.reduce(
    (acc, s) => {
      acc.events += s.totalEvents;
      acc.errors += s.errorCount;
      acc.runs += s.recentRuns;
      return acc;
    },
    { events: 0, errors: 0, runs: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Scrape Status</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {totals.runs} recent runs · {totals.events} events found · {totals.errors} errors
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded text-xs font-medium bg-gray-100 hover:bg-gray-200"
          >
            Refresh
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-3 py-1.5 rounded text-xs font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {running ? "Running…" : "Run scrape now"}
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {/* Per-source summary */}
      <div className="space-y-2">
        {summary.map((row) => {
          const status = row.latest?.status ?? "never";
          const colorCls =
            STATUS_COLORS[status] ?? "bg-gray-50 text-gray-500 border-gray-200";
          const isExpanded = expandedSource === row.source.id;
          const sourceRuns = runs.filter((r) => r.sourceId === row.source.id).slice(0, 10);

          return (
            <div
              key={row.source.id}
              className={`bg-white border border-gray-200 rounded-lg p-3 ${
                !row.source.enabled ? "opacity-50" : ""
              }`}
            >
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() =>
                  setExpandedSource(isExpanded ? null : row.source.id)
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{row.source.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase ${colorCls}`}
                    >
                      {status}
                    </span>
                    {row.latest && (
                      <span className="text-[11px] text-gray-500">
                        {row.latest.eventsFound} events
                      </span>
                    )}
                    {!row.source.enabled && (
                      <span className="text-[10px] text-gray-400">disabled</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Last run {fmtTime(row.latest?.startedAt ?? null)}
                    {row.latest?.durationMs != null
                      ? ` · ${(row.latest.durationMs / 1000).toFixed(1)}s`
                      : ""}
                    {" · "}
                    {row.successCount}✓ {row.emptyCount}∅ {row.errorCount}✕ over {row.recentRuns} runs
                  </p>
                  {row.latest?.status === "error" && row.latest.errorMessage && (
                    <p className="text-xs text-red-600 mt-1 truncate">
                      ⚠ {row.latest.errorMessage}
                    </p>
                  )}
                </div>
                <span className="text-gray-400 text-xs ml-2">
                  {isExpanded ? "▾" : "▸"}
                </span>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                  {sourceRuns.length === 0 ? (
                    <p className="text-xs text-gray-400">No runs recorded yet.</p>
                  ) : (
                    sourceRuns.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between text-xs gap-2"
                      >
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase ${
                            STATUS_COLORS[r.status] ?? ""
                          }`}
                        >
                          {r.status}
                        </span>
                        <span className="text-gray-500 flex-1 min-w-0 truncate">
                          {new Date(r.startedAt).toLocaleString()} · {r.eventsFound} events
                          {r.durationMs != null
                            ? ` · ${(r.durationMs / 1000).toFixed(1)}s`
                            : ""}
                        </span>
                        {r.errorMessage && (
                          <span className="text-red-600 truncate max-w-[40%]">
                            {r.errorMessage}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
