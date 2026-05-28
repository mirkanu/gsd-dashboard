import type { GsdProject, SessionState } from "../lib/types";

interface ChatListFiltersProps {
  projects: GsdProject[];
  activeFilter: SessionState | null;
  onFilterChange: (state: SessionState | null) => void;
  groupBy?: 'state' | 'stage';
  onGroupByChange?: (mode: 'state' | 'stage') => void;
}

const FILTERS: { label: string; state: SessionState | null }[] = [
  { label: "All", state: null },
  { label: "Waiting", state: "waiting" },
  { label: "Working", state: "working" },
  { label: "Paused", state: "paused" },
  { label: "Archived", state: "archived" },
];

export function ChatListFilters({ projects, activeFilter, onFilterChange, groupBy, onGroupByChange }: ChatListFiltersProps) {
  const getCount = (state: SessionState | null): number => {
    if (state === null) {
      return projects.filter((p) => p.sessionState !== "archived").length;
    }
    return projects.filter((p) => p.sessionState === state).length;
  };

  return (
    <div>
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
      {onGroupByChange && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-t border-[var(--border)] mt-1">
          <span className="text-[10px] text-gray-500 font-medium">Group by:</span>
          {(['state', 'stage'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onGroupByChange(mode)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                groupBy === mode ? 'bg-accent/20 text-accent' : 'bg-surface-3 text-gray-400 hover:text-gray-200'
              }`}
            >
              {mode === 'state' ? 'State' : 'Stage'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
