import { useEffect, useRef, useState, useCallback } from "react";
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
  X,
} from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
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

const SESSION_STATE_CONFIG: Record<import("../lib/types").SessionState, { border: string; label: string; labelCls: string }> = {
  working:  { border: "border-l-4 border-l-emerald-500",  label: "Working",  labelCls: "text-emerald-400" },
  waiting:  { border: "border-l-4 border-l-amber-400",    label: "Waiting",  labelCls: "text-amber-400"   },
  paused:   { border: "border-l-4 border-l-red-500",      label: "Paused",   labelCls: "text-red-400"     },
  archived: { border: "border-l-4 border-l-gray-600",     label: "Archived", labelCls: "text-gray-500"    },
};

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

// ─── Send box ─────────────────────────────────────────────────────────────────

const GSD_CHIPS = [
  "/gsd:resume-work",
  "/gsd:progress",
  "/gsd:pause-work",
  "/gsd:plan-phase",
] as const;

const CONTEXT_WINDOW = 200_000;

function ContextBar({ tokens }: { tokens: number }) {
  const pct = Math.min(tokens / CONTEXT_WINDOW, 1);
  const hue = Math.round(120 * (1 - pct));
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] text-gray-500">Context window</span>
        <span className="text-[10px]" style={{ color: `hsl(${hue}, 70%, 55%)` }}>
          {Math.round(pct * 100)}%
        </span>
      </div>
      <div className="w-full h-1 rounded-full bg-surface-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, backgroundColor: `hsl(${hue}, 70%, 45%)` }}
        />
      </div>
    </div>
  );
}

function SendBox({ projectName, initialValue, contextTokens }: { projectName: string; initialValue: string; contextTokens: number | null }) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  // Reset input value when the project changes (different card)
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSubmit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = value.trim();
    if (!text || status === "sending") return;
    setStatus("sending");
    try {
      await api.gsd.send(projectName, text);
      setStatus("sent");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <div
      className="px-4 py-3 border-b border-border/50"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ContextBar hidden — token data inaccurate (cumulative vs current prompt); TODO: fix data source */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e as unknown as React.MouseEvent); }}
          placeholder="Send to tmux session…"
          className="flex-1 text-xs bg-surface-3 border border-border rounded px-2 py-1.5 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-accent/50"
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || status === "sending"}
          className="text-xs px-3 py-1.5 rounded bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {status === "sending" ? "…" : status === "sent" ? "Sent!" : status === "error" ? "Error" : "Send"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {GSD_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={(e) => { e.stopPropagation(); setValue(chip); }}
            className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-surface-3 text-gray-500 hover:text-gray-300 hover:border-border/80 transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Terminal overlay ─────────────────────────────────────────────────────────

interface TerminalOverlayProps {
  projectName: string;
  wsBase: string | null;
  onClose: () => void;
}

function TerminalOverlay({ projectName, wsBase, onClose }: TerminalOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Build WebSocket URL — use tunnel base when in Railway proxy mode
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = wsBase ?? `${proto}//${window.location.host}`;
    const wsUrl = `${base}/ws/terminal/${encodeURIComponent(projectName)}`;

    // Create terminal
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: '#0d1117', foreground: '#c9d1d9' },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    termRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send initial size
      ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
    };

    ws.onmessage = (event) => {
      terminal.write(event.data);
    };

    ws.onclose = (event) => {
      if (event.code === 4004) {
        terminal.write('\r\n\x1b[31mSession is not active.\x1b[0m\r\n');
      } else if (event.code === 4005) {
        terminal.write('\r\n\x1b[31mTerminal backend unavailable (node-pty not installed).\x1b[0m\r\n');
      } else if (event.code !== 1000) {
        terminal.write(`\r\n\x1b[31mConnection closed (${event.code}).\x1b[0m\r\n`);
      }
    };

    ws.onerror = () => {
      terminal.write('\r\n\x1b[31mFailed to connect to terminal backend.\x1b[0m\r\n');
    };

    // Forward keystrokes to WS
    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    };
    window.addEventListener('resize', handleResize);

    // Handle Escape key to close
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      ws.close();
      terminal.dispose();
    };
  }, [projectName, onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/90 flex flex-col"
      style={{ zIndex: 70 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d] flex-shrink-0">
        <span className="text-sm text-gray-300 font-mono">{projectName} — tmux session</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-3 text-gray-400 hover:text-white transition-colors"
          aria-label="Close terminal"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Terminal container — fills remaining height */}
      <div ref={containerRef} className="flex-1 overflow-hidden p-2" />
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project, onSelect, onOpenTerminal, onArchive, onUnarchive
}: {
  project: GsdProject;
  onSelect: (project: GsdProject) => void;
  onOpenTerminal: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { state, roadmap, requirements } = project;
  const progress = state?.progress;
  const stateConf = SESSION_STATE_CONFIG[project.sessionState ?? "paused"];

  const phaseSummary =
    progress?.completed_phases != null && progress?.total_phases != null
      ? `${progress.completed_phases}/${progress.total_phases} phases`
      : null;

  return (
    <div className={`card flex flex-col gap-0 overflow-hidden cursor-pointer ${stateConf.border}`} onClick={() => onSelect(project)}>
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
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-[11px] font-medium flex-shrink-0 ${stateConf.labelCls}`}>
              {stateConf.label}
            </span>
            {state?.blockers && state.blockers.length > 0 && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-red-500/10 text-red-400 border-red-500/20">
                Blocked
              </span>
            )}
            <StatusBadge status={state?.status ?? null} />
          </div>
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

      {/* Next action */}
      {state?.next_action && (
        <div className="px-4 py-2.5 border-b border-border/50">
          <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
            <span className="text-gray-600">Next: </span>{state.next_action}
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

      {/* Stats row */}
      {(project.velocity > 0 || project.streak > 0 || project.estimatedCompletion) && (
        <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-2 flex-wrap text-[11px] text-gray-500">
          {project.velocity > 0 && (
            <span>{project.velocity} plan{project.velocity !== 1 ? 's' : ''} this week</span>
          )}
          {project.velocity > 0 && project.streak > 0 && <span className="text-gray-700">·</span>}
          {project.streak > 0 && (
            <span>{project.streak} day streak</span>
          )}
          {project.estimatedCompletion && (project.velocity > 0 || project.streak > 0) && (
            <span className="text-gray-700">·</span>
          )}
          {project.estimatedCompletion && (
            <span>{project.estimatedCompletion} est.</span>
          )}
        </div>
      )}

      {/* Send box — only when tmux session is active */}
      {project.tmuxActive && (
        <SendBox
          projectName={project.name}
          initialValue={state?.next_action ?? ""}
          contextTokens={project.contextTokens ?? null}
        />
      )}

      {/* Open terminal button — only when tmux session is active */}
      {project.tmuxActive && (
        <div className="mt-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenTerminal(); }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-accent transition-colors px-2 py-1 rounded hover:bg-surface-3"
          >
            <span className="text-[11px]">⌨</span>
            Open terminal
          </button>
        </div>
      )}

      {/* Archive / Unarchive button */}
      {project.sessionState !== "archived" ? (
        <div className="px-4 pb-3 pt-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            Archive
          </button>
        </div>
      ) : (
        <div className="px-4 pb-3 pt-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onUnarchive(); }}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Unarchive
          </button>
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
  const [terminalProject, setTerminalProject] = useState<string | null>(null);
  const [terminalWsBase, setTerminalWsBase] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

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

  const archiveProject = useCallback(async (name: string) => {
    try {
      await api.gsd.archive(name);
      load();
    } catch { /* silent fail */ }
  }, [load]);

  const unarchiveProject = useCallback(async (name: string) => {
    try {
      await api.gsd.unarchive(name);
      load();
    } catch { /* silent fail */ }
  }, [load]);

  // Fetch terminal WS base URL once on mount (null = use relative URL)
  useEffect(() => {
    api.gsd.wsBase().then(({ wsBase }) => setTerminalWsBase(wsBase ?? null)).catch(() => {});
  }, []);

  // Auto-load on mount (VIEW-06)
  useEffect(() => {
    load();
  }, [load]);

  const activeProjects = projects.filter(p => p.sessionState !== "archived");
  const archivedProjects = projects.filter(p => p.sessionState === "archived");

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
        <>
          {/* Active project cards grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...activeProjects]
              .sort((a, b) => {
                const aBlocked = (a.state?.blockers?.length ?? 0) > 0 ? 0 : 1;
                const bBlocked = (b.state?.blockers?.length ?? 0) > 0 ? 0 : 1;
                if (aBlocked !== bBlocked) return aBlocked - bBlocked;
                const aTime = a.sessionUpdatedAt ? new Date(a.sessionUpdatedAt).getTime() : 0;
                const bTime = b.sessionUpdatedAt ? new Date(b.sessionUpdatedAt).getTime() : 0;
                return bTime - aTime;
              })
              .map((project) => (
              <ProjectCard
                key={project.name}
                project={project}
                onSelect={setSelectedProject}
                onOpenTerminal={() => setTerminalProject(project.name)}
                onArchive={() => archiveProject(project.name)}
                onUnarchive={() => unarchiveProject(project.name)}
              />
            ))}
          </div>

          {/* Archived section */}
          {archivedProjects.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setArchivedOpen(v => !v)}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-3"
              >
                {archivedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                View archived ({archivedProjects.length})
              </button>
              {archivedOpen && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {archivedProjects.map((project) => (
                    <ProjectCard
                      key={project.name}
                      project={project}
                      onSelect={setSelectedProject}
                      onOpenTerminal={() => setTerminalProject(project.name)}
                      onArchive={() => archiveProject(project.name)}
                      onUnarchive={() => unarchiveProject(project.name)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
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
      {terminalProject && (
        <TerminalOverlay
          projectName={terminalProject}
          wsBase={terminalWsBase}
          onClose={() => setTerminalProject(null)}
        />
      )}
    </div>
  );
}
