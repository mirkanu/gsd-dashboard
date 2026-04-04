import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Maximize2 } from "lucide-react";
import { api } from "../lib/api";
import type { GsdProject, GsdMessage } from "../lib/types";
import { TasksTab } from "./TasksTab";

type TabId = "tasks" | "messages" | "state" | "roadmap" | "requirements" | "plan";

const TABS: { id: TabId; label: string }[] = [
  { id: "tasks",        label: "Tasks"    },
  { id: "messages",     label: "Messages" },
  { id: "state",        label: "State"    },
  { id: "roadmap",      label: "Roadmap"  },
  { id: "requirements", label: "Reqs"     },
  { id: "plan",         label: "Plan"     },
];

const SESSION_STATE_STYLE: Record<string, string> = {
  working: "bg-emerald-500/20 text-emerald-400",
  waiting: "bg-amber-400/20 text-amber-400",
  paused: "bg-red-500/20 text-red-400",
  archived: "bg-gray-600/20 text-gray-500",
};

function MessageLog({ projectName }: { projectName: string }) {
  const [messages, setMessages] = useState<GsdMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.gsd.messages(projectName)
      .then(({ messages }) => { if (!cancelled) { setMessages(messages); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectName]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      endRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    }
  }, [loading, messages.length]);

  if (loading) return <p className="text-sm text-gray-500 py-4">Loading messages...</p>;
  if (messages.length === 0) return <p className="text-sm text-gray-600 py-4">No messages yet.</p>;

  const sorted = [...messages].reverse();

  return (
    <div className="space-y-2">
      {sorted.map((msg) => (
        <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
            msg.direction === "outbound"
              ? "bg-accent/10 text-accent border border-accent/20"
              : "bg-surface-3 text-gray-300 border border-border"
          }`}>
            <p className="font-mono whitespace-pre-wrap break-all">{msg.content}</p>
            <p className={`text-[10px] mt-1 ${msg.direction === "outbound" ? "text-accent/50" : "text-gray-600"}`}>
              {msg.direction === "outbound" ? "Sent" : "Received"} · {new Date(msg.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

interface ProjectDetailsPanelProps {
  project: GsdProject;
  onExpand?: (content: string, tabId: string) => void;
}

export function ProjectDetailsPanel({ project, onExpand }: ProjectDetailsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("tasks");
  const [content, setContent]     = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === "messages" || activeTab === "tasks") return;
    let cancelled = false;
    setContent(null);
    setFetchError(null);
    setLoading(true);
    api.gsd.file(project.name, activeTab)
      .then((text) => { if (!cancelled) { setContent(text); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setFetchError(err.message ?? "Failed to load file"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [activeTab, project.name]);

  const displayName = project.display_name || project.name.charAt(0).toUpperCase() + project.name.slice(1);

  return (
    <div className="flex flex-col h-full bg-surface-2 border-l border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold text-gray-100 capitalize truncate">{displayName}</span>
        {project.sessionState && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            SESSION_STATE_STYLE[project.sessionState] || SESSION_STATE_STYLE.archived
          }`}>
            {project.sessionState}
          </span>
        )}
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-border px-3 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {/* Expand button for markdown content tabs */}
        {content !== null && onExpand && activeTab !== "messages" && activeTab !== "tasks" && (
          <button
            onClick={() => onExpand(content, activeTab)}
            className="ml-auto px-2 py-2 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Expand to full screen"
            title="Full screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === "tasks" ? (
          <TasksTab projectKey={project.name} />
        ) : activeTab === "messages" ? (
          <MessageLog projectName={project.name} />
        ) : (
          <>
            {loading && (
              <p className="text-sm text-gray-500 py-4">Loading...</p>
            )}
            {fetchError && !loading && (
              <p className="text-sm text-red-400 py-4">{fetchError}</p>
            )}
            {!loading && !fetchError && content !== null && (
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
