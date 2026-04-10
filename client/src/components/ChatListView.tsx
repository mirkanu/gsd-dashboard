import {
  ConversationList,
  Conversation,
} from "@chatscope/chat-ui-kit-react";
import { timeAgo } from "../lib/timeAgo";
import { formatElapsed } from "../lib/format";
import type { GsdProject, SessionState } from "../lib/types";

interface ChatListViewProps {
  projects: GsdProject[];
  onSelectProject: (name: string) => void;
  activeProject?: string;
  unreadCounts?: Record<string, number>;
  /** Monotonic now timestamp (ms) used to render live elapsed-time labels. */
  nowMs?: number;
}

const STATE_BORDER: Record<SessionState, string> = {
  working: "border-l-emerald-500",
  waiting: "border-l-blue-500",
  paused: "border-l-orange-500",
  archived: "border-l-gray-600",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

export function ChatListView({ projects, onSelectProject, activeProject, unreadCounts, nowMs }: ChatListViewProps) {
  // Sort by sessionUpdatedAt descending (newest first), nulls to bottom
  const sorted = [...projects].sort((a, b) => {
    if (!a.sessionUpdatedAt && !b.sessionUpdatedAt) return 0;
    if (!a.sessionUpdatedAt) return 1;
    if (!b.sessionUpdatedAt) return -1;
    return new Date(b.sessionUpdatedAt).getTime() - new Date(a.sessionUpdatedAt).getTime();
  });

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
        No projects found
      </div>
    );
  }

  return (
    <ConversationList>
      {sorted.map((p) => {
        const displayName = p.display_name || capitalize(p.name);
        // Prefer the live currentTask preview (from tmux) over the generic
        // statusText fallback — STAT-04. Falls back gracefully when null.
        const baseInfo = p.currentTask
          ? truncate(p.currentTask, 80)
          : p.statusText
            ? truncate(p.statusText, 80)
            : capitalize(p.sessionState);
        // Live-ticking elapsed label (STAT-03). Prefix with the state so
        // users see "Working 2m 30s" / "Waiting 5m" next to the task preview.
        const elapsed =
          nowMs !== undefined && p.stateEnteredAt && p.sessionState !== "archived"
            ? formatElapsed(p.stateEnteredAt, nowMs)
            : "";
        const stateLabel = capitalize(p.sessionState);
        const info = elapsed
          ? `${stateLabel} ${elapsed} · ${baseInfo}`
          : baseInfo;

        return (
          <div
            key={p.name}
            className={`border-l-4 ${STATE_BORDER[p.sessionState]}${activeProject === p.name ? ' bg-accent/10' : ''}`}
          >
            <Conversation
              name={displayName}
              info={info}
              lastActivityTime={timeAgo(p.sessionUpdatedAt)}
              unreadCnt={unreadCounts?.[p.name] || 0}
              onClick={() => onSelectProject(p.name)}
            />
          </div>
        );
      })}
    </ConversationList>
  );
}
