interface DayHeaderProps {
  date: string; // YYYY-MM-DD
}

export function DayHeader({ date }: DayHeaderProps) {
  const d = new Date(date + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let label: string;
  if (d.toDateString() === today.toDateString()) {
    label = "Today";
  } else if (d.toDateString() === tomorrow.toDateString()) {
    label = "Tomorrow";
  } else {
    label = d.toLocaleDateString("en-US", { weekday: "long" });
  }

  const formatted = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="text-orange-500 font-bold text-sm uppercase tracking-widest py-3" data-day-header>
      {label} &mdash; {formatted}
    </div>
  );
}
