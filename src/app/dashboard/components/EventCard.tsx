"use client";

import { useState } from "react";

interface EventCardProps {
  id: number;
  title: string;
  date: string;
  time: string | null;
  venue: string;
  distanceMiles: number | null;
  price: string | null;
  description: string | null;
  url: string | null;
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
  url,
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
      details: `${description ?? ""}\n\n${url ?? ""}`.trim(),
      ctz: "America/Los_Angeles",
    });

    window.open(`https://calendar.google.com/calendar/render?${params}`, "_blank");
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {timeStr && `${timeStr} · `}
            {venue}
            {distance && ` · ${distance}`}
            {price && ` · ${price}`}
          </p>
        </div>
        <span className={`${scoreColor} text-xs font-bold px-2 py-0.5 rounded ml-2 flex-shrink-0`}>
          {finalScore}
        </span>
      </div>

      {description && (
        <p className="text-xs text-gray-400 mt-2">{description}</p>
      )}

      {interaction === "thumbs_down" ? (
        <p className="text-xs text-gray-400 mt-3 text-center">Marked not interested</p>
      ) : (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onInteract(id, "thumbs_up")}
            className={`flex-1 text-center py-2 rounded-md text-xs font-semibold transition-colors ${
              interaction === "thumbs_up"
                ? "bg-green-100 border border-green-300 text-green-700"
                : "bg-green-50 border border-green-200 text-green-600 hover:bg-green-100"
            }`}
          >
            {interaction === "thumbs_up" ? "Interested!" : "Interested"}
          </button>
          <button
            onClick={handleThumbsDown}
            className="flex-1 text-center py-2 bg-red-50 border border-red-200 rounded-md text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
          >
            Not for me
          </button>
          <button
            onClick={handleCalendar}
            className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-md text-xs hover:bg-gray-200 transition-colors"
          >
            📅
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${suffix}`;
}
