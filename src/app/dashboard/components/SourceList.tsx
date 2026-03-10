"use client";

interface Source {
  id: number;
  name: string;
  type: string;
  url: string | null;
  searchQuery: string | null;
  enabled: number;
  lastScrapedAt: string | null;
}

interface SourceListProps {
  sources: Source[];
  onToggle: (id: number, enabled: boolean) => void;
  onDelete: (id: number) => void;
}

export function SourceList({ sources, onToggle, onDelete }: SourceListProps) {
  return (
    <div className="space-y-2">
      {sources.map((source) => (
        <div
          key={source.id}
          className={`bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between ${
            !source.enabled ? "opacity-50" : ""
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{source.name}</span>
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">
                {source.type}
              </span>
            </div>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {source.url ?? source.searchQuery}
            </p>
            {source.lastScrapedAt && (
              <p className="text-xs text-gray-300 mt-0.5">
                Last scraped: {new Date(source.lastScrapedAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 ml-3">
            <button
              onClick={() => onToggle(source.id, !source.enabled)}
              className={`px-2 py-1 rounded text-xs font-medium ${
                source.enabled
                  ? "bg-green-50 text-green-600 border border-green-200"
                  : "bg-gray-100 text-gray-500 border border-gray-200"
              }`}
            >
              {source.enabled ? "On" : "Off"}
            </button>
            <button
              onClick={() => onDelete(source.id)}
              className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
