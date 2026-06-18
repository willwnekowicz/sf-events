"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface EventCall {
  id: number;
  eventId: number | null;
  phone: string;
  status: string;
  roomName: string | null;
  eventTitle: string;
  eventSummary: string | null;
  score: number | null;
  friends: string | null; // JSON array
  transcript: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  initiated: "bg-gray-50 text-gray-600 border-gray-200",
  ringing: "bg-amber-50 text-amber-700 border-amber-200 animate-pulse",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200 animate-pulse",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleDateString();
}

function parseFriends(json: string | null): string[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export default function CallsPage() {
  const [calls, setCalls] = useState<EventCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCalls = useCallback(async () => {
    const rows = (await fetch("/api/calls").then((r) => r.json())) as EventCall[];
    setCalls(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // Poll while any call is live.
  const anyLive = calls.some((c) => ["initiated", "ringing", "in_progress"].includes(c.status));
  useEffect(() => {
    if (anyLive && !pollRef.current) {
      pollRef.current = setInterval(fetchCalls, 2000);
    } else if (!anyLive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [anyLive, fetchCalls]);

  const testCall = async () => {
    setCalling(true);
    try {
      const res = await fetch("/api/calls/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(`Call failed: ${data.message ?? data.error ?? res.statusText}`);
      await fetchCalls();
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Event Calls</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            The agent phones you about a hot event and asks which friends might want to go.
          </p>
        </div>
        <button
          onClick={testCall}
          disabled={calling}
          className="px-3 py-1.5 rounded text-xs font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
        >
          {calling ? "Calling…" : "📞 Test call me now"}
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {!loading && calls.length === 0 && (
        <p className="text-sm text-gray-400">
          No calls yet. Hit “Test call me now” (needs OPENAI_API_KEY + a LiveKit phone number) or wait for a
          high-scoring event from a scrape.
        </p>
      )}

      <div className="space-y-2">
        {calls.map((c) => {
          const friends = parseFriends(c.friends);
          return (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="font-medium text-sm truncate">{c.eventTitle}</span>
                  {c.score != null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-bold bg-emerald-50 text-emerald-700 border-emerald-200">
                      {c.score}
                    </span>
                  )}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase ${
                      STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                    }`}
                  >
                    {c.status.replace("_", " ")}
                  </span>
                </div>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtTime(c.createdAt)}</span>
              </div>

              <p className="text-xs text-gray-500 mt-1">📱 {c.phone}</p>

              {friends.length > 0 && (
                <div className="mt-2">
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">Friends to check with</span>
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {friends.map((f, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {c.status === "failed" && c.errorMessage && (
                <p className="text-xs text-red-600 mt-1.5">⚠ {c.errorMessage}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
