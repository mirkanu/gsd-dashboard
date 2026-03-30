import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  RefreshCw,
  MapPin,
  ExternalLink,
  X,
} from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "../lib/api";
import type { GsdProject } from "../lib/types";
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
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize truncate max-w-[120px] ${STATUS_STYLES[level]}`}>
      {label}
    </span>
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
  const [focused, setFocused] = useState(false);
  const isMobile = window.matchMedia('(pointer: coarse)').matches;

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
      setValue("");
      setStatus("sent");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <div
      className={`px-4 py-3 border-b border-border/50 ${
        focused && isMobile ? "fixed left-0 right-0 bg-[#0d1117] border-t border-border z-[80]" : ""
      }`}
      style={focused && isMobile ? { bottom: 0 } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ContextBar hidden — token data inaccurate (cumulative vs current prompt); TODO: fix data source */}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e as unknown as React.MouseEvent); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Send to tmux session…"
          className="flex-1 text-xs bg-surface-3 border border-border rounded px-2 py-1.5 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-accent/50"
          style={{ fontSize: isMobile ? 16 : undefined }}
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSubmit}
          onTouchEnd={(e) => { e.preventDefault(); handleSubmit(e as unknown as React.MouseEvent); }}
          disabled={!value.trim() || status === "sending"}
          className="text-xs px-3 py-1.5 rounded bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          {status === "sending" ? "…" : status === "sent" ? "Sent!" : status === "error" ? "Error" : "Send"}
        </button>
      </div>
    </div>
  );
}

// ─── Special key bar (mobile) ─────────────────────────────────────────────────

const SPECIAL_KEYS = [
  { label: "\u2190", seq: "\x1b[D" },
  { label: "\u2192", seq: "\x1b[C" },
  { label: "\u2191", seq: "\x1b[A" },
  { label: "\u2193", seq: "\x1b[B" },
  { label: "Tab", seq: "\t" },
  { label: "Esc", seq: "\x1b" },
  { label: "Ctrl+C", seq: "\x03" },
  { label: "Enter", seq: "\r" },
] as const;

function SpecialKeyBar({ wsRef, termRef }: { wsRef: React.RefObject<WebSocket | null>; termRef: React.RefObject<Terminal | null> }) {
  const send = (seq: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(seq);
    }
    // Re-focus terminal so scroll position and input focus stay on the terminal,
    // not on the button that was just tapped.
    termRef.current?.focus();
  };
  return (
    <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-border/50">
      {SPECIAL_KEYS.map((key) => (
        <button
          key={key.label}
          onTouchStart={(e) => { e.preventDefault(); send(key.seq); }}
          onTouchEnd={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          className="text-[11px] px-2.5 py-1.5 rounded border border-border bg-surface-3 text-gray-400 active:bg-accent/20 active:text-accent active:border-accent/30 transition-colors select-none"
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}

// ─── Terminal overlay ─────────────────────────────────────────────────────────

interface TerminalOverlayProps {
  projectName: string;
  wsBase: string | null;
  onClose: () => void;
  initialSendValue: string;
}

function TerminalOverlay({ projectName, wsBase, onClose, initialSendValue }: TerminalOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // Stable ref so onClose never causes the effect to re-run (parent re-renders every 30s)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [isMobile] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [terminalFocused, setTerminalFocused] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Build WebSocket URL — use tunnel base when in Railway proxy mode
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = wsBase ?? `${proto}//${window.location.host}`;
    const wsUrl = `${base}/ws/terminal/${encodeURIComponent(projectName)}`;

    // Create terminal
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: window.matchMedia('(pointer: coarse)').matches ? 10 : 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: '#0d1117', foreground: '#c9d1d9' },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminal.focus(); // give keyboard focus to terminal on open
    termRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send initial size
      ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
    };

    // Strip mouse-mode enable/disable sequences from pty output so xterm.js
    // never enters mouse reporting mode. This keeps local text selection and
    // scroll working. Tmux sends these when `set -g mouse on` is active.
    const MOUSE_MODE_RE = /\x1b\[\?(?:1000|1002|1003|1006|1015)[hl]/g;
    ws.onmessage = (event) => {
      const data = typeof event.data === 'string' ? event.data.replace(MOUSE_MODE_RE, '') : event.data;
      terminal.write(data);
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

    // Forward keystrokes to WS — selectively filter mouse sequences.
    // We strip mouse-mode enable from pty output (above) so xterm.js does local
    // text selection. But we still need to forward scroll events (SGR buttons
    // 64/65) to tmux so it scrolls its pane buffer on desktop.
    // On mobile, block ALL mouse sequences (beta generates NaN-coordinate garbage).
    // On desktop, block click/drag (buttons 0-2, 32-34) but allow scroll through.
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    terminal.onData((data) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (data.startsWith('\x1b[M')) return; // X10 — always block
      if (data.startsWith('\x1b[<')) {
        if (isTouchDevice) return; // mobile — block all SGR
        // Desktop: parse button number, allow scroll (64/65), block click/drag
        const btn = parseInt(data.slice(3), 10);
        if (isNaN(btn) || btn < 64) return;
      }
      ws.send(data);
    });

    // Copy selected text to clipboard automatically when selection changes
    terminal.onSelectionChange(() => {
      const sel = terminal.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
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
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);

    // Mouse wheel scroll: use xterm.js official API to bypass its internal
    // wheel-to-arrow-key conversion (which fires because we stripped mouse mode
    // and tmux uses the alternate buffer with no scrollback).
    // Returning false prevents xterm.js from processing the event at all.
    const container = containerRef.current;
    terminal.attachCustomWheelEventHandler((ev) => {
      if (ws.readyState !== WebSocket.OPEN) return false;
      const lines = Math.max(1, Math.round(Math.abs(ev.deltaY) / ((terminal.options.fontSize as number) ?? 14)));
      const seq = ev.deltaY > 0 ? '\x1b[<65;1;1M' : '\x1b[<64;1;1M';
      for (let i = 0; i < lines; i++) ws.send(seq);
      return false;
    });

    // Touch scroll: attach on .xterm-screen (where xterm.js binds its own touch
    // handler) with capture phase so we fire FIRST. preventDefault +
    // stopImmediatePropagation prevents xterm.js from converting to arrow keys.
    const screen = container.querySelector('.xterm-screen') || container;
    let touchStartY = 0;
    let touchStartX = 0;
    let scrollIntent = false;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      scrollIntent = false;
    };
    const SCROLL_DAMPING = 3; // pixels of drag per tmux scroll line (higher = slower/more deliberate)
    const handleTouchMove = (e: TouchEvent) => {
      const dy = touchStartY - e.touches[0].clientY;
      const dx = touchStartX - e.touches[0].clientX;
      if (!scrollIntent) {
        if (Math.abs(dy) < 5) return;
        scrollIntent = Math.abs(dy) >= Math.abs(dx);
      }
      if (!scrollIntent) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      touchStartY = e.touches[0].clientY;
      const fontSize = (terminal.options.fontSize as number) ?? 10;
      const lines = Math.max(1, Math.abs(Math.round(dy / (fontSize * SCROLL_DAMPING))));
      const seq = dy > 0 ? '\x1b[<64;1;1M' : '\x1b[<65;1;1M';
      for (let i = 0; i < lines; i++) {
        if (ws.readyState === WebSocket.OPEN) ws.send(seq);
      }
    };
    // Tap to focus: call terminal.focus() on touchend when no scroll intent
    const handleTouchEnd = () => {
      if (!scrollIntent) terminal.focus();
    };
    screen.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    screen.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    screen.addEventListener('touchend', handleTouchEnd, { capture: true });

    // Track xterm textarea focus so mobile can hide SendBox when typing directly
    const xtermTextarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
    const handleXtermFocus = () => setTerminalFocused(true);
    const handleXtermBlur = () => setTerminalFocused(false);
    xtermTextarea?.addEventListener('focus', handleXtermFocus);
    xtermTextarea?.addEventListener('blur', handleXtermBlur);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      screen.removeEventListener('touchstart', handleTouchStart, { capture: true } as EventListenerOptions);
      screen.removeEventListener('touchmove', handleTouchMove, { capture: true } as EventListenerOptions);
      screen.removeEventListener('touchend', handleTouchEnd, { capture: true } as EventListenerOptions);
      xtermTextarea?.removeEventListener('focus', handleXtermFocus);
      xtermTextarea?.removeEventListener('blur', handleXtermBlur);
      ws.close();
      terminal.dispose();
    };
  }, [projectName]);

  // Shift overlay up when the mobile software keyboard reduces the visual viewport
  useEffect(() => {
    if (!window.visualViewport) return;

    const handleViewportResize = () => {
      const offset = window.innerHeight - (window.visualViewport?.height ?? window.innerHeight);
      setBottomOffset(Math.max(0, offset));
      // After DOM reflow: refit terminal to new height, scroll cursor into view,
      // and tell the pty about the new dimensions so line-wrap is correct.
      setTimeout(() => {
        fitAddonRef.current?.fit();
        const t = termRef.current;
        const ws = wsRef.current;
        if (t) {
          t.scrollToBottom();
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: t.cols, rows: t.rows }));
          }
        }
      }, 100);
    };

    window.visualViewport.addEventListener('resize', handleViewportResize);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
    };
  }, []); // empty deps — mount/unmount only

  return (
    <div
      className="fixed inset-0 bg-black/90 flex flex-col"
      style={{ zIndex: 70, bottom: bottomOffset > 0 ? bottomOffset : undefined, overscrollBehavior: 'contain' }}
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
      {/* Send box + special keys — mobile only (desktop has physical keyboard) */}
      {isMobile && (
        <div className="flex-shrink-0">
          {!terminalFocused && (
            <SendBox
              projectName={projectName}
              initialValue={initialSendValue}
              contextTokens={null}
            />
          )}
          <SpecialKeyBar wsRef={wsRef} termRef={termRef} />
        </div>
      )}
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project, onSelect, onOpenTerminal, onArchive, onUnarchive, onReopenTmux
}: {
  project: GsdProject;
  onSelect: (project: GsdProject) => void;
  onOpenTerminal: (initialValue: string) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onReopenTmux: () => void;
}) {
  const [reopening, setReopening] = useState(false);
  const { state } = project;
  const stateConf = SESSION_STATE_CONFIG[project.sessionState ?? "paused"];

  return (
    <div className={`card flex flex-col gap-0 overflow-hidden cursor-pointer w-full min-w-0 ${stateConf.border}`} onClick={() => onSelect(project)}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50 overflow-hidden">
        <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-accent flex-shrink-0" />
            <h3 className="text-sm font-semibold text-gray-100 truncate capitalize">{project.display_name || project.name}</h3>
            {project.version && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded border bg-surface-3 text-gray-400 border-border flex-shrink-0">
                {project.version}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 flex-shrink overflow-hidden">
            <span className={`text-[11px] font-medium flex-shrink-0 ${stateConf.labelCls}`}>
              {stateConf.label}
            </span>
            {state?.blockers && state.blockers.length > 0 && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-red-500/10 text-red-400 border-red-500/20 flex-shrink-0">
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

      {/* Terminal button — open when active, re-open when configured but dead */}
      {project.tmuxActive ? (
        <div className="mt-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.matchMedia('(pointer: coarse)').matches) {
                window.open(`/terminal/${encodeURIComponent(project.name)}`, '_blank');
              } else {
                onOpenTerminal(state?.next_action ?? "");
              }
            }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-accent transition-colors px-2 py-1 rounded hover:bg-surface-3"
          >
            <span className="text-[11px]">⌨</span>
            Open terminal
          </button>
        </div>
      ) : project.tmuxSession && (
        <div className="mt-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="text-[11px] text-gray-600">Tmux closed.</span>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (reopening) return;
                setReopening(true);
                try {
                  await api.gsd.reopenTmux(project.name);
                } catch { /* silent */ }
                setReopening(false);
                onReopenTmux();
              }}
              disabled={reopening}
              className="text-xs text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
            >
              {reopening ? "Starting…" : "Re-open"}
            </button>
          </div>
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

    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function GSD() {
  const [projects, setProjects] = useState<GsdProject[]>([]);
  const [rateLimit, setRateLimit] = useState<{ active: boolean; resetAt: string | null }>({ active: false, resetAt: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProject, setSelectedProject] = useState<GsdProject | null>(null);
  const [fullScreen, setFullScreen] = useState<{ content: string; title: string } | null>(null);
  const [terminalProject, setTerminalProject] = useState<string | null>(null);
  const [terminalWsBase, setTerminalWsBase] = useState<string | null>(null);
  const [terminalInitialValue, setTerminalInitialValue] = useState<string>("");

  const TAB_TITLES: Record<string, string> = {
    messages: "Messages",
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
      setRateLimit(data.rateLimit ?? { active: false, resetAt: null });
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

  // Auto-load on mount + poll every 30s for real-time session state (VIEW-06)
  useEffect(() => {
    load();
    const interval = setInterval(() => load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Live countdown for rate-limit reset
  const [rateLimitCountdown, setRateLimitCountdown] = useState<string | null>(null);
  useEffect(() => {
    if (!rateLimit.active || !rateLimit.resetAt) {
      setRateLimitCountdown(null);
      return;
    }
    const tick = () => {
      const diff = new Date(rateLimit.resetAt!).getTime() - Date.now();
      if (diff <= 0) { setRateLimitCountdown("resetting…"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRateLimitCountdown(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const t = setInterval(tick, 1_000);
    return () => clearInterval(t);
  }, [rateLimit]);

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

      {/* Rate-limit banner */}
      {rateLimit.active && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-300 text-sm">
          <span className="text-orange-400 text-base">⚠</span>
          <span className="font-medium">Rate limit active across all sessions.</span>
          {rateLimitCountdown
            ? <span className="ml-1 text-orange-400 font-mono">Resets in {rateLimitCountdown}</span>
            : <span className="ml-1 text-orange-400/70">Reset time unknown — check your Anthropic plan.</span>
          }
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

      {/* Kanban board */}
      {!loading && !error && (
        /* Mobile:  scroll-snap-x, each column is min-w-full so it fills viewport, user swipes.
           Desktop: flex row, each column takes equal width (flex-1, min-w-0). */
        <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 -mx-4 px-4 md:-mx-8 md:px-8">
          {(["waiting", "working", "paused", "archived"] as import("../lib/types").SessionState[]).map((state) => {
            const conf = SESSION_STATE_CONFIG[state];
            const columnProjects = [...projects.filter(p => p.sessionState === state)]
              .sort((a, b) => a.name.localeCompare(b.name));
            return (
              <div
                key={state}
                /* Mobile: min-w-full snaps to center one column at a time.
                   Desktop (md+): flex-1 + min-w-0 shares space equally across all 4 columns. */
                className="bg-surface-1 rounded-xl border border-border p-3 flex flex-col flex-shrink-0 snap-center min-w-full md:min-w-0 md:flex-1"
              >
                {/* Column header */}
                <div className="flex items-center gap-2 mb-4 px-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    state === "waiting"  ? "bg-amber-400" :
                    state === "working"  ? "bg-emerald-500 animate-pulse" :
                    state === "paused"   ? "bg-red-500" :
                                           "bg-gray-600"
                  }`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${conf.labelCls}`}>
                    {conf.label}
                  </span>
                  <span className="ml-auto text-[11px] text-gray-600 bg-surface-3 px-2 py-0.5 rounded-full">
                    {columnProjects.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2.5 overflow-y-auto overflow-x-hidden min-w-0 max-h-[70vh]">
                  {columnProjects.length > 0 ? (
                    columnProjects.map((project) => (
                      <ProjectCard
                        key={project.name}
                        project={project}
                        onSelect={setSelectedProject}
                        onOpenTerminal={(initialValue) => {
                          setTerminalProject(project.name);
                          setTerminalInitialValue(initialValue);
                        }}
                        onArchive={() => archiveProject(project.name)}
                        onUnarchive={() => unarchiveProject(project.name)}
                        onReopenTmux={() => load()}
                      />
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-24 text-xs text-gray-600">
                      No projects
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
      {terminalProject && (
        <TerminalOverlay
          projectName={terminalProject}
          wsBase={terminalWsBase}
          onClose={() => { setTerminalProject(null); setTerminalInitialValue(""); load(); }}
          initialSendValue={terminalInitialValue}
        />
      )}
    </div>
  );
}

// Standalone full-screen terminal page — used on mobile where the overlay
// approach is awkward; opens in a new browser tab via /terminal/:name
export function TerminalPage() {
  const { name } = useParams<{ name: string }>();
  const [wsBase, setWsBase] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    api.gsd.wsBase().then(({ wsBase }) => setWsBase(wsBase ?? null)).catch(() => setWsBase(null));
  }, []);

  if (!name) return null;
  // Wait for wsBase fetch before mounting the terminal — connecting with the
  // wrong host causes an immediate 4004 "Session not active" error on Railway.
  if (wsBase === undefined) return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <span className="text-gray-500 font-mono text-sm">Connecting…</span>
    </div>
  );

  return (
    <TerminalOverlay
      projectName={decodeURIComponent(name)}
      wsBase={wsBase}
      onClose={() => window.close()}
      initialSendValue=""
    />
  );
}
