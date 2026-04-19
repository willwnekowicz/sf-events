const SOURCE_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  "Eventbrite":       { bg: "bg-orange-100", text: "text-orange-700", darkBg: "bg-orange-900", darkText: "text-orange-300" },
  "Meetup":           { bg: "bg-red-100",    text: "text-red-700",    darkBg: "bg-red-900",    darkText: "text-red-300" },
  "Lu.ma":            { bg: "bg-purple-100", text: "text-purple-700", darkBg: "bg-purple-900", darkText: "text-purple-300" },
  "Partiful":         { bg: "bg-pink-100",   text: "text-pink-700",   darkBg: "bg-pink-900",   darkText: "text-pink-300" },
  "Facebook Events":  { bg: "bg-blue-100",   text: "text-blue-700",   darkBg: "bg-blue-900",   darkText: "text-blue-300" },
  "Google Events":    { bg: "bg-teal-100",   text: "text-teal-700",   darkBg: "bg-teal-900",   darkText: "text-teal-300" },
  "SF Funcheap":      { bg: "bg-amber-100",  text: "text-amber-700",  darkBg: "bg-amber-900",  darkText: "text-amber-300" },
  "Manny's":          { bg: "bg-emerald-100",text: "text-emerald-700",darkBg: "bg-emerald-900",darkText: "text-emerald-300" },
  "KQED":             { bg: "bg-indigo-100", text: "text-indigo-700", darkBg: "bg-indigo-900", darkText: "text-indigo-300" },
};

// Fallback colors for user-added sources, deterministic by name hash
const FALLBACK_PALETTE = [
  { bg: "bg-cyan-100",    text: "text-cyan-700",    darkBg: "bg-cyan-900",    darkText: "text-cyan-300" },
  { bg: "bg-rose-100",    text: "text-rose-700",    darkBg: "bg-rose-900",    darkText: "text-rose-300" },
  { bg: "bg-violet-100",  text: "text-violet-700",  darkBg: "bg-violet-900",  darkText: "text-violet-300" },
  { bg: "bg-lime-100",    text: "text-lime-700",    darkBg: "bg-lime-900",    darkText: "text-lime-300" },
  { bg: "bg-sky-100",     text: "text-sky-700",     darkBg: "bg-sky-900",     darkText: "text-sky-300" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-700", darkBg: "bg-fuchsia-900", darkText: "text-fuchsia-300" },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getSourceColor(source: string, mode: "light" | "dark" = "light") {
  const colors = SOURCE_COLORS[source] ?? FALLBACK_PALETTE[hashString(source) % FALLBACK_PALETTE.length];
  if (mode === "dark") {
    return { bg: colors.darkBg, text: colors.darkText };
  }
  return { bg: colors.bg, text: colors.text };
}
