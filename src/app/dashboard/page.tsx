"use client";

import { useEffect, useState, useCallback } from "react";
import { EventCard } from "./components/EventCard";
import { FilterPills } from "./components/FilterPills";
import { DayGroup } from "./components/DayGroup";

interface Event {
  id: number;
  title: string;
  date: string;
  time: string | null;
  venue: string;
  distanceMiles: number | null;
  price: string | null;
  description: string | null;
  sources: { name: string; url: string | null }[];
  finalScore: number;
  interaction: string | null;
}

export default function DashboardPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState("all");
  const [scraping, setScraping] = useState(false);

  const fetchEvents = useCallback(async () => {
    const res = await fetch(`/api/events?filter=${filter}`);
    const data = await res.json();
    setEvents(data);
  }, [filter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleInteract = async (eventId: number, action: string) => {
    await fetch("/api/events/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, action }),
    });

    // Update local state optimistically, then refetch
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, interaction: action } : e))
    );
  };

  const handleScrape = async () => {
    setScraping(true);
    try {
      await fetch("/api/scrape", { method: "POST" });
      await fetchEvents();
    } catch (err) {
      console.error("Scrape failed:", err);
    } finally {
      setScraping(false);
    }
  };

  // Group events by date
  const grouped = new Map<string, Event[]>();
  const displayEvents = events;

  for (const event of displayEvents) {
    const group = grouped.get(event.date) ?? [];
    group.push(event);
    grouped.set(event.date, group);
  }

  const sortedDates = [...grouped.keys()].sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <FilterPills active={filter} onChange={setFilter} />
        <button
          onClick={handleScrape}
          disabled={scraping}
          className="px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-800 disabled:opacity-50 flex-shrink-0"
        >
          {scraping ? "Scraping..." : "Scrape Now"}
        </button>
      </div>

      {sortedDates.length === 0 ? (
        <div className="text-center text-gray-400 py-20">
          <p className="text-sm">No events yet.</p>
          <p className="text-xs mt-1">Hit &quot;Scrape Now&quot; to discover events.</p>
        </div>
      ) : (
        sortedDates.map((date) => (
          <DayGroup key={date} date={date}>
            {grouped.get(date)!.map((event) => (
              <EventCard
                key={event.id}
                {...event}
                onInteract={handleInteract}
              />
            ))}
          </DayGroup>
        ))
      )}
    </div>
  );
}
