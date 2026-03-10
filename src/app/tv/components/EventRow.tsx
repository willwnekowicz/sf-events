import { ScoreBadge } from "./ScoreBadge";

interface EventRowProps {
  time: string | null;
  title: string;
  venue: string;
  distanceMiles: number | null;
  price: string | null;
  description: string | null;
  finalScore: number;
}

export function EventRow({
  time,
  title,
  venue,
  distanceMiles,
  price,
  description,
  finalScore,
}: EventRowProps) {
  let borderColor = "border-red-500";
  if (finalScore >= 80) borderColor = "border-green-500";
  else if (finalScore >= 60) borderColor = "border-blue-500";
  else if (finalScore >= 40) borderColor = "border-yellow-500";

  const distance = distanceMiles != null ? `${distanceMiles.toFixed(1)}mi` : null;

  return (
    <div className={`flex gap-3 p-3 bg-neutral-900 rounded-lg border-l-4 ${borderColor} mb-2`}>
      <div className="min-w-[50px] text-neutral-500 text-sm">
        {time ? formatTime(time) : "TBD"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white text-sm truncate">{title}</div>
        <div className="text-neutral-400 text-xs">
          {venue}
          {distance && ` · ${distance}`}
          {price && ` · ${price}`}
        </div>
        {description && (
          <div className="text-neutral-600 text-xs mt-1 line-clamp-2">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0 self-start">
        <ScoreBadge score={finalScore} />
      </div>
    </div>
  );
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "p" : "a";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")}${suffix}`;
}
