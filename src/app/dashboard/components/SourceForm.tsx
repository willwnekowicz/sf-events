"use client";

import { useState } from "react";

interface SourceFormProps {
  onAdd: () => void;
}

export function SourceForm({ onAdd }: SourceFormProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"platform" | "venue">("platform");
  const [url, setUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        url: type === "venue" ? url : undefined,
        searchQuery: type === "platform" ? searchQuery : undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      return;
    }

    setName("");
    setUrl("");
    setSearchQuery("");
    onAdd();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <h3 className="font-bold text-sm mb-3">Add Source</h3>

      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setType("platform")}
          className={`px-3 py-1 rounded text-xs font-medium ${
            type === "platform" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          Platform
        </button>
        <button
          type="button"
          onClick={() => setType("venue")}
          className={`px-3 py-1 rounded text-xs font-medium ${
            type === "venue" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          Venue
        </button>
      </div>

      <input
        type="text"
        placeholder="Source name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border border-gray-200 rounded px-3 py-2 text-sm mb-2"
        required
      />

      {type === "venue" ? (
        <input
          type="url"
          placeholder="Events page URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm mb-2"
          required
        />
      ) : (
        <input
          type="text"
          placeholder="Search query (e.g., 'events in SF site:meetup.com')"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm mb-2"
          required
        />
      )}

      {error && <p className="text-red-500 text-xs mb-2">{error}</p>}

      <button
        type="submit"
        className="w-full bg-gray-900 text-white rounded py-2 text-sm font-medium hover:bg-gray-800"
      >
        Add Source
      </button>
    </form>
  );
}
