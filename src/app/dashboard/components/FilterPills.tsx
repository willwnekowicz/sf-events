interface FilterPillsProps {
  active: string;
  onChange: (filter: string) => void;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "unrated", label: "Unrated" },
];

export function FilterPills({ active, onChange }: FilterPillsProps) {
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      {FILTERS.map((filter) => (
        <button
          key={filter.key}
          onClick={() => onChange(filter.key)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            active === filter.key
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
