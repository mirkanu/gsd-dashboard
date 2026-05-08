import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, Maximize2 } from "lucide-react";
import { api, HttpError } from "../lib/api";
import type { GsdProject, AutopilotRun } from "../lib/types";
import { TasksTab } from "./TasksTab";
import { ProjectControls } from "./ProjectControls";
import { ProjectMetadata } from "./ProjectMetadata";

type TabId = "tasks" | "state" | "roadmap" | "requirements" | "plan";

const TABS: { id: TabId; label: string }[] = [
  { id: "tasks",        label: "Tasks"    },
  { id: "state",        label: "State"    },
  { id: "roadmap",      label: "Roadmap"  },
  { id: "requirements", label: "Reqs"     },
  { id: "plan",         label: "Plan"     },
];

interface GsdDrawerProps {
  project: GsdProject;
  autopilotRun: AutopilotRun | null;
  onPauseSession: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onOpenTerminal: () => void;
  onReopenTmux: () => void;
  onClose: () => void;
  onExpand?: (content: string, tabId: TabId) => void;
}

export function GsdDrawer({ project, autopilotRun, onPauseSession, onArchive, onUnarchive, onOpenTerminal, onReopenTmux, onClose, onExpand }: GsdDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("tasks");
  const [content, setContent]     = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notFoundMsg, setNotFoundMsg] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === "tasks") return;
    let cancelled = false;
    setContent(null);
    setFetchError(null);
    setNotFoundMsg(null);
    setLoading(true);
    api.gsd.file(project.name, activeTab)
      .then((text) => { if (!cancelled) { setContent(text); setLoading(false); } })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof HttpError && err.status === 404) {
            setNotFoundMsg(err.message === 'Setup in progress'
              ? 'Setting up — planning files will appear once the milestone is created.'
              : 'Not initialized yet — run /gsd-new-project in the terminal.');
          } else {
            setFetchError(err.message ?? "Failed to load file");
          }
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [activeTab, project.name]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-surface-2 border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-100 capitalize">{project.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Metadata + Controls */}
        <ProjectMetadata project={project} />
        <ProjectControls
          project={project}
          autopilotRun={autopilotRun}
          onPauseSession={onPauseSession}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onOpenTerminal={onOpenTerminal}
          onReopenTmux={onReopenTmux}
        />
        <div className="border-b border-border" />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col">
          {/* Tab strip */}
          <div className="flex gap-1 border-b border-border mb-4 -mx-5 px-5 flex-shrink-0">
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
            {/* Expand button -- only shown when content is loaded and not on tasks tab */}
            {content !== null && onExpand && activeTab !== "tasks" && (
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
          <div className="flex-1 overflow-y-auto">
            {activeTab === "tasks" ? (
              <TasksTab projectKey={project.name} />
            ) : (
              <>
                {loading && (
                  <p className="text-sm text-gray-500 py-4">Loading...</p>
                )}
                {notFoundMsg && !loading && (
                  <p className="text-sm text-gray-500 py-4">{notFoundMsg}</p>
                )}
                {fetchError && !loading && (
                  <p className="text-sm text-red-400 py-4">{fetchError}</p>
                )}
                {!loading && !fetchError && !notFoundMsg && content !== null && (
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
