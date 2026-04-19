"use client";

import { useEffect, useRef } from "react";
import { DayHeader } from "./DayHeader";
import { EventRow } from "./EventRow";
import { ComingSoon } from "./ComingSoon";

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
}

interface EventTimelineProps {
  events: Event[];
}

const SCROLL_SPEED = 0.5;       // pixels per frame
const DAY_PAUSE_MS = 10000;     // 10 seconds pause at each day header

export function EventTimeline({ events }: EventTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Group events by date
  const today = new Date().toISOString().split("T")[0];
  const fourteenDaysOut = new Date();
  fourteenDaysOut.setDate(fourteenDaysOut.getDate() + 14);
  const cutoff = fourteenDaysOut.toISOString().split("T")[0];

  const mainEvents = events.filter((e) => e.date <= cutoff);
  const futureEvents = events.filter((e) => e.date > cutoff);

  const grouped = new Map<string, Event[]>();
  for (const event of mainEvents) {
    const group = grouped.get(event.date) ?? [];
    group.push(event);
    grouped.set(event.date, group);
  }

  const sortedDates = [...grouped.keys()].sort();

  // Auto-scroll logic
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationId: number;
    let paused = false;
    let pauseTimeout: NodeJS.Timeout;

    const scroll = () => {
      if (!paused) {
        container.scrollTop += SCROLL_SPEED;

        // Check if we've reached the bottom
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
          paused = true;
          pauseTimeout = setTimeout(() => {
            container.scrollTop = 0;
            paused = false;
          }, DAY_PAUSE_MS);
        }

        // Check if a day header is at the top of the viewport
        const headers = container.querySelectorAll("[data-day-header]");
        headers.forEach((header) => {
          const rect = header.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          if (Math.abs(rect.top - containerRect.top) < 2 && !paused) {
            paused = true;
            pauseTimeout = setTimeout(() => {
              paused = false;
            }, DAY_PAUSE_MS);
          }
        });
      }

      animationId = requestAnimationFrame(scroll);
    };

    animationId = requestAnimationFrame(scroll);

    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(pauseTimeout);
    };
  }, [events]);

  return (
    <div ref={containerRef} className="h-screen overflow-hidden px-6 py-4">
      {sortedDates.map((date) => (
        <div key={date}>
          <DayHeader date={date} />
          {grouped.get(date)!.map((event) => (
            <EventRow
              key={event.id}
              time={event.time}
              title={event.title}
              venue={event.venue}
              distanceMiles={event.distanceMiles}
              price={event.price}
              description={event.description}
              sources={event.sources}
              finalScore={event.finalScore}
            />
          ))}
        </div>
      ))}

      <ComingSoon
        events={futureEvents.map((e) => ({
          date: e.date,
          title: e.title,
          finalScore: e.finalScore,
        }))}
      />
    </div>
  );
}
