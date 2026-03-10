"use client";

import { useEffect, useState, useCallback } from "react";
import { SourceForm } from "../components/SourceForm";
import { SourceList } from "../components/SourceList";

interface Source {
  id: number;
  name: string;
  type: string;
  url: string | null;
  searchQuery: string | null;
  enabled: number;
  lastScrapedAt: string | null;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);

  const fetchSources = useCallback(async () => {
    const res = await fetch("/api/sources");
    const data = await res.json();
    setSources(data);
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleToggle = async (id: number, enabled: boolean) => {
    await fetch("/api/sources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: enabled ? 1 : 0 }),
    });
    fetchSources();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/sources?id=${id}`, { method: "DELETE" });
    fetchSources();
  };

  return (
    <div>
      <SourceForm onAdd={fetchSources} />
      <h3 className="font-bold text-sm mb-3">Active Sources ({sources.length})</h3>
      <SourceList sources={sources} onToggle={handleToggle} onDelete={handleDelete} />
    </div>
  );
}
