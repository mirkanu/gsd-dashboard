import type { GsdProject, SessionState } from "../lib/types";

interface ChatListFiltersProps {
  projects: GsdProject[];
  activeFilter: SessionState | null;
  onFilterChange: (state: SessionState | null) => void;
}

const FILTERS: { label: string; state: SessionState | null }[] = [
  { label: "All", state: null },
  { label: "Waiting", state: "waiting" },
  { label: "Working", state: "working" },
  { label: "Paused", state: "paused" },
  { label: "Archived", state: "archived" },
];

export function ChatListFilters({ projects, activeFilter, onFilterChange }: ChatListFiltersProps) {
  const getCount = (state: SessionState | null): number => {
    if (state === null) {
      return projects.filter((p) => p.sessionState !== "archived").length;
    }
    return projects.filter((p) => p.sessionState === state).length;
  };

  return (
    <div className="flex gap-1 px-3 py-2 overflow-x-auto">
      {FILTERS.map(({ label, state }) => {
        const isActive = activeFilter === state;
        const count = getCount(state);
        return (
          <button
            key={label}
            onClick={() => onFilterChange(state)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 flex-shrink-0 ${
              isActive
                ? "bg-accent/20 text-accent"
                : "bg-surface-3 text-gray-400 hover:text-gray-200"
            }`}
          >
            {label}
            <span
              className={`text-[10px] px-1.5 rounded-full ${
                isActive ? "bg-accent/30 text-accent" : "bg-surface-2 text-gray-500"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
