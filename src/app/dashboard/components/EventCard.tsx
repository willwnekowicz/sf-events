"use client";

import { useState } from "react";
import { getSourceColor } from "@/lib/source-colors";

interface EventCardProps {
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
  interaction?: string | null;
  onInteract: (eventId: number, action: string) => void;
}

export function EventCard({
  id,
  title,
  date,
  time,
  venue,
  distanceMiles,
  price,
  description,
  sources,
  finalScore,
  interaction,
  onInteract,
}: EventCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  let scoreColor = "bg-red-500 text-white";
  if (finalScore >= 80) scoreColor = "bg-green-500 text-black";
  else if (finalScore >= 60) scoreColor = "bg-blue-500 text-white";
  else if (finalScore >= 40) scoreColor = "bg-yellow-500 text-black";

  const distance = distanceMiles != null ? `${distanceMiles.toFixed(1)}mi` : null;
  const timeStr = time ? formatTime(time) : null;

  const handleThumbsDown = () => {
    onInteract(id, "thumbs_down");
    setDismissed(true);
  };

  const handleCalendar = () => {
    onInteract(id, "calendar_added");

    // Build Google Calendar URL
    const startDate = date.replace(/-/g, "");

    let dates: string;
    if (time) {
      // Timed event: use start time, assume 2-hour duration
      const [h, mins] = time.split(":").map(Number);
      const startTime = `${String(h).padStart(2, "0")}${String(mins).padStart(2, "0")}00`;
      const endH = Math.min(h + 2, 23);
      const endTime = `${String(endH).padStart(2, "0")}${String(mins).padStart(2, "0")}00`;
      dates = `${startDate}T${startTime}/${startDate}T${endTime}`;
    } else {
      // All-day event: end date must be the next day (exclusive)
      const nextDay = new Date(date + "T12:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      const endDate = nextDay.toISOString().split("T")[0].replace(/-/g, "");
      dates = `${startDate}/${endDate}`;
    }

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates,
      location: venue,
      details: `${description ?? ""}\n\n${sources.find((s) => s.url)?.url ?? ""}`.trim(),
      ctz: "America/Los_Angeles",
    });

    window.open(`https://calendar.google.com/calendar/render?${params}`, "_blank");
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-2 flex gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-sm">{title}</h3>
          <span className={`${scoreColor} text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0`}>
            {finalScore}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {timeStr && `${timeStr} · `}
          {venue}
          {distance && ` · ${distance}`}
          {price && ` · ${price}`}
        </p>
        {description && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-1">{description}</p>
        )}
        {sources.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1">
            {sources.map((s, i) => (
              <SourceChip key={i} source={s.name} url={s.url} eventTitle={title} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 flex-shrink-0 justify-center">
        {interaction === "thumbs_down" ? (
          <span className="text-[10px] text-gray-400">dismissed</span>
        ) : (
          <>
            <button
              onClick={() => onInteract(id, "thumbs_up")}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                interaction === "thumbs_up"
                  ? "bg-green-100 text-green-700"
                  : "bg-green-50 text-green-600 hover:bg-green-100"
              }`}
              title="Interested"
            >
              👍
            </button>
            <button
              onClick={handleThumbsDown}
              className="px-2 py-1 rounded text-[11px] font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              title="Not for me"
            >
              👎
            </button>
            <button
              onClick={handleCalendar}
              className="px-2 py-1 rounded text-[11px] bg-gray-50 hover:bg-gray-100 transition-colors"
              title="Add to calendar"
            >
              📅
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SourceChip({ source, url, eventTitle }: { source: string; url: string | null; eventTitle: string }) {
  const colors = getSourceColor(source, "light");
  const href = url ?? `https://www.google.com/search?q=${encodeURIComponent(`${eventTitle} ${source} San Francisco`)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors.bg} ${colors.text} hover:opacity-70 transition-opacity`}
    >
      {source}
    </a>
  );
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${suffix}`;
}
