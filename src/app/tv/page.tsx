"use client";

import { useEffect, useState } from "react";
import { EventTimeline } from "./components/EventTimeline";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface Event {
  id: number;
  title: string;
  date: string;
  time: string | null;
  venue: string;
  distanceMiles: number | null;
  price: string | null;
  description: string | null;
  finalScore: number;
}

export default function TVPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Failed to fetch events:", err);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* Header */}
      <div className="text-center py-4 border-b border-neutral-800">
        <h1 className="text-2xl font-bold">SF Events</h1>
        {lastUpdated && (
          <p className="text-xs text-neutral-500 mt-1">Updated {lastUpdated}</p>
        )}
      </div>

      {events.length === 0 ? (
        <div className="flex items-center justify-center h-[80vh]">
          <p className="text-neutral-500">No events yet. Trigger a scrape from the dashboard.</p>
        </div>
      ) : (
        <EventTimeline events={events} />
      )}
    </div>
  );
}
