"use client";

import { useEffect, useState, useCallback } from "react";
import { ProfileEditor } from "../components/ProfileEditor";

interface InteractionRecord {
  id: number;
  action: string;
  note: string | null;
  createdAt: string;
  eventTitle: string;
  eventVenue: string;
}
interface Interests {
  likes: string[];
  dislikes: string[];
}

const ACTION_ICON: Record<string, string> = {
  thumbs_up: "👍",
  thumbs_down: "👎",
  calendar_added: "📅",
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`;
  if (diffMin < 1440 * 7) return `${Math.floor(diffMin / 1440)}d`;
  return d.toLocaleDateString();
}

export default function ProfilePage() {
  const [profileText, setProfileText] = useState("");
  const [version, setVersion] = useState(0);
  const [history, setHistory] = useState<InteractionRecord[]>([]);
  const [insights, setInsights] = useState<Interests | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/profile");
    const data = await res.json();
    if (data.profile) {
      setProfileText(data.profile.profileText);
      setVersion(data.profile.version);
    }
    setHistory(data.history ?? []);
  }, []);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const data = await fetch("/api/profile/insights").then((r) => r.json());
      setInsights(data);
    } catch {
      setInsights({ likes: [], dislikes: [] });
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchInsights();
  }, [fetchProfile, fetchInsights]);

  const handleSave = async (text: string) => {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileText: text }),
    });
    const data = await res.json();
    if (data.version) setVersion(data.version);
    fetchInsights(); // profile changed → re-derive interest tags
  };

  return (
    <div>
      <ProfileEditor initialText={profileText} version={version} onSave={handleSave} />

      {/* Interest tags */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-sm mb-3">Interests</h3>
        {insightsLoading ? (
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="h-6 w-16 rounded-full bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <TagGroup label="Into" tags={insights?.likes ?? []} tone="pos" />
            <TagGroup label="Not into" tags={insights?.dislikes ?? []} tone="neg" />
          </div>
        )}
      </div>

      {/* Interaction history */}
      <h3 className="font-bold text-sm mb-2">Interaction History</h3>
      {history.length === 0 ? (
        <p className="text-gray-400 text-xs">No interactions yet.</p>
      ) : (
        <div className="space-y-1.5">
          {history.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">{ACTION_ICON[item.action] ?? "•"}</span>
                <span className="font-medium text-sm truncate">{item.eventTitle}</span>
                <span className="text-[11px] text-gray-400 ml-auto whitespace-nowrap">{fmtTime(item.createdAt)}</span>
              </div>
              {item.note && (
                <p className="text-xs text-gray-600 italic mt-1 pl-6">“{item.note}”</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TagGroup({ label, tags, tone }: { label: string; tags: string[]; tone: "pos" | "neg" }) {
  const chip =
    tone === "pos"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-rose-50 text-rose-700 border-rose-200";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">
        {tone === "pos" ? "✓ " : "✕ "}
        {label}
      </div>
      {tags.length === 0 ? (
        <span className="text-xs text-gray-300">Nothing yet — react to a few events.</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className={`text-xs px-2.5 py-1 rounded-full border ${chip}`}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
