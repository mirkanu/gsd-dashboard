import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  MapPin,
  Layers,
  ClipboardList,
  ExternalLink,
} from "lucide-react";
import { api } from "../lib/api";
import type { GsdProject, GsdPhase } from "../lib/types";
import { GsdDrawer } from "../components/GsdDrawer";
import { MarkdownViewer } from "../components/MarkdownViewer";

// ─── Status badge ─────────────────────────────────────────────────────────────

type StatusLevel = "success" | "info" | "warn" | "muted";

function classifyStatus(status: string | null): StatusLevel {
  if (!status) return "muted";
  const s = status.toLowerCase();
  if (s.includes("complete") || s.includes("done") || s.includes("shipped")) return "success";
  if (s.includes("progress") || s.includes("active")) return "info";
  if (s.includes("verif") || s.includes("awaiting") || s.includes("planning")) return "warn";
  return "muted";
}

const STATUS_STYLES: Record<StatusLevel, string> = {
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  info: "bg-accent/10 text-accent border-accent/20",
  warn: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  muted: "bg-surface-3 text-gray-400 border-border",
};

function StatusBadge({ status }: { status: string | null }) {
  const level = classifyStatus(status);
  const label = status ? status.replace(/-/g, " ") : "unknown";
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLES[level]}`}>
      {label}
    </span>
  );
}

// ─── Phase status icon ────────────────────────────────────────────────────────

function PhaseIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s.includes("complete") || s.includes("done")) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
  if (s.includes("progress")) return <Clock className="w-3.5 h-3.5 text-accent flex-shrink-0" />;
  if (s.includes("verif") || s.includes("awaiting")) return <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
  return <Circle className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ percent, className = "" }: { percent: number | null; className?: string }) {
  const pct = percent ?? 0;
  return (
    <div className={`h-1.5 rounded-full bg-surface-3 overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full bg-accent transition-all duration-500"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

// ─── Roadmap panel ────────────────────────────────────────────────────────────

function RoadmapPanel({ phases }: { phases: GsdPhase[] }) {
  return (
    <div className="space-y-1">
      {phases.map((phase, i) => (
        <div key={i} className="flex items-start gap-2 py-1">
          <PhaseIcon status={phase.status} />
          <div className="flex-1 min-w-0">
            <span className={`text-xs ${phase.status.includes("complete") ? "text-gray-400" : "text-gray-200"}`}>
              {phase.name}
            </span>
          </div>
          {phase.plans_done !== null && phase.plans_total !== null && (
            <span className="text-[11px] text-gray-600 flex-shrink-0">
              {phase.plans_done}/{phase.plans_total}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, onSelect }: { project: GsdProject; onSelect: (project: GsdProject) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { state, roadmap, requirements } = project;
  const progress = state?.progress;

  const phaseSummary =
    progress?.completed_phases != null && progress?.total_phases != null
      ? `${progress.completed_phases}/${progress.total_phases} phases`
      : null;

  return (
    <div className="card flex flex-col gap-0 overflow-hidden cursor-pointer" onClick={() => onSelect(project)}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-accent flex-shrink-0" />
            <h3 className="text-sm font-semibold text-gray-100 truncate capitalize">{project.name}</h3>
            {project.version && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded border bg-surface-3 text-gray-400 border-border flex-shrink-0">
                {project.version}
              </span>
            )}
          </div>
          <StatusBadge status={state?.status ?? null} />
        </div>

        {state?.current_phase && (
          <p className="text-xs text-gray-500 truncate pl-6">Phase {state.current_phase}</p>
        )}
        {state?.milestone_name && state.milestone_name !== "milestone" && (
          <p className="text-xs text-gray-600 truncate pl-6">{state.milestone_name}</p>
        )}
        {project.liveUrl && (
          <a
            href={project.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-accent hover:text-accent/80 truncate pl-6 block mt-0.5 hover:underline"
          >
            <ExternalLink className="w-3 h-3 inline mr-1 align-middle" />
            {project.liveUrl}
          </a>
        )}
      </div>

      {/* Progress */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">Overall progress</span>
          <span className="text-xs font-medium text-gray-300">{progress?.percent ?? 0}%</span>
        </div>
        <ProgressBar percent={progress?.percent ?? null} />
        <div className="flex items-center justify-between mt-2 text-[11px] text-gray-600">
          {phaseSummary && <span>{phaseSummary}</span>}
          {requirements && (
            <span>{requirements.checked}/{requirements.total} reqs ({requirements.percent}%)</span>
          )}
        </div>
      </div>

      {/* Last activity */}
      {state?.last_activity && (
        <div className="px-4 py-2.5 border-b border-border/50">
          <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
            <span className="text-gray-600">Last: </span>{state.last_activity}
          </p>
        </div>
      )}

      {/* Blockers */}
      {state?.blockers && state.blockers.length > 0 && (
        <div className="px-4 py-2.5 border-b border-border/50">
          {state.blockers.map((b, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-400/80 leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      )}

      {/* Expandable roadmap */}
      {roadmap && roadmap.phases.length > 0 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="flex items-center gap-2 px-4 py-2.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-colors w-full text-left"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <Layers className="w-3.5 h-3.5" />
            <span>{roadmap.phases.length} phases</span>
            {requirements && (
              <>
                <span className="text-gray-700">·</span>
                <ClipboardList className="w-3.5 h-3.5" />
                <span>{requirements.percent}% requirements</span>
              </>
            )}
          </button>

          {expanded && (
            <div className="px-4 pb-4 pt-1">
              {requirements && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-gray-600">Requirements coverage</span>
                    <span className="text-[11px] text-gray-500">{requirements.checked}/{requirements.total}</span>
                  </div>
                  <ProgressBar percent={requirements.percent} />
                </div>
              )}
              <RoadmapPanel phases={roadmap.phases} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function GSD() {
  const [projects, setProjects] = useState<GsdProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProject, setSelectedProject] = useState<GsdProject | null>(null);
  const [fullScreen, setFullScreen] = useState<{ content: string; title: string } | null>(null);

  const TAB_TITLES: Record<string, string> = {
    state: "State",
    roadmap: "Roadmap",
    requirements: "Requirements",
    plan: "Plan",
  };

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const data = await api.gsd.projects();
      setProjects(data.projects);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GSD data");
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  // Auto-load on mount (VIEW-06)
  useEffect(() => {
    load();
  }, [load]);

  const totalProjects = projects.length;
  const activeCount = projects.filter((p) => {
    const s = p.state?.status?.toLowerCase() ?? "";
    return s.includes("progress") || s.includes("planning") || s.includes("verif");
  }).length;
  const completeCount = projects.filter((p) => {
    const pct = p.state?.progress?.percent;
    return pct === 100;
  }).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">GSD Projects</h2>
          <p className="text-sm text-gray-500">Unified view across all configured projects</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-3 border border-border transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      {!loading && !error && projects.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Projects", value: totalProjects },
            { label: "Active", value: activeCount },
            { label: "Complete", value: completeCount },
          ].map(({ label, value }) => (
            <div key={label} className="card py-3 px-4 text-center">
              <div className="text-2xl font-bold text-gray-100">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
          Loading project data…
        </div>
      )}

      {error && (
        <div className="card p-4 border-red-500/20 bg-red-500/5">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Project cards grid */}
      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.name} project={project} onSelect={setSelectedProject} />
          ))}
        </div>
      )}

      {selectedProject && (
        <GsdDrawer
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onExpand={(content, tabId) => setFullScreen({ content, title: TAB_TITLES[tabId] ?? tabId })}
        />
      )}
      {fullScreen && (
        <MarkdownViewer
          content={fullScreen.content}
          title={fullScreen.title}
          onClose={() => setFullScreen(null)}
        />
      )}
    </div>
  );
}
