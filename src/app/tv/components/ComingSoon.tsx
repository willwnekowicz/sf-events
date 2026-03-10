import { ScoreBadge } from "./ScoreBadge";

interface ComingSoonEvent {
  date: string;
  title: string;
  finalScore: number;
}

interface ComingSoonProps {
  events: ComingSoonEvent[];
}

export function ComingSoon({ events }: ComingSoonProps) {
  if (events.length === 0) return null;

  return (
    <div className="border-t border-neutral-700 pt-4 mt-6">
      <div className="text-neutral-500 font-bold text-xs uppercase tracking-widest mb-3">
        Coming Up
      </div>
      {events.map((event, i) => {
        const d = new Date(event.date + "T12:00:00");
        const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return (
          <div key={i} className="flex justify-between items-center py-1.5 text-neutral-500 text-xs">
            <span>{formatted} · {event.title}</span>
            <ScoreBadge score={event.finalScore} />
          </div>
        );
      })}
    </div>
  );
}
