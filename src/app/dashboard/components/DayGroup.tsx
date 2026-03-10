interface DayGroupProps {
  date: string;
  children: React.ReactNode;
}

export function DayGroup({ date, children }: DayGroupProps) {
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
    <div className="mb-6">
      <h2 className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-3">
        {label} &mdash; {formatted}
      </h2>
      {children}
    </div>
  );
}
