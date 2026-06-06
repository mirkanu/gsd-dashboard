import { useEffect, useRef, useState, useCallback } from "react";
import { eventBus } from "../lib/eventBus";
import { useParams } from "react-router-dom";
import {
  RefreshCw,
  MapPin,
  ExternalLink,
  X,
  Sun,
  Moon,
  Info,
} from "lucide-react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { api } from "../lib/api";
import type { GsdProject, SessionState, ProjectStateChangeEvent, ProjectStage } from "../lib/types";
import { formatElapsed } from "../lib/format";
import { GsdDrawer } from "../components/GsdDrawer";
import { MarkdownViewer } from "../components/MarkdownViewer";
import { ChatListView } from "../components/ChatListView";
import { ChatListFilters } from "../components/ChatListFilters";
import { ProjectDetailsPanel } from "../components/ProjectDetailsPanel";
import { PauseConfirmDialog } from "../components/PauseConfirmDialog";
import { AutopilotControls } from "../components/AutopilotControls";
import { VerifyBadge } from "../components/VerifyBadge";
import { useResizableColumns } from "../hooks/useResizableColumns";
import { useProjectCreationStateSubscriber } from "../hooks/useProjectCreationState";
import { CommandChips } from "../components/CommandChips";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

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
  waiting:  { border: "border-l-4 border-l-blue-500",     label: "Waiting",  labelCls: "text-blue-400"    },
  paused:   { border: "border-l-4 border-l-orange-500",   label: "Paused",   labelCls: "text-orange-400"  },
  archived: { border: "border-l-4 border-l-gray-600",     label: "Archived", labelCls: "text-gray-500"    },
};

// Phase 49: humanize busy-marker kinds for the `waiting · bg` tooltip.
// Exported for unit testing. `kinds` is deduped (server-side Set); count is
// the total marker count. Rule: single-kind → "N background task[s]"; multi-kind
// → "N items: background task, running agent, …" (each kind singular label).
export function humanizeBusyMarkers(bm: { count: number; kinds: string[] }): string {
  const singular = (k: string): string =>
    k === 'bash_bg' ? 'background task'
    : k === 'agent' ? 'running agent'
    : k === 'wakeup' ? 'scheduled wakeup'
    : k;
  const plural = (k: string, n: number): string =>
    `${n} ${singular(k)}${n === 1 ? '' : 's'}`;
  if (!bm || !bm.kinds || bm.kinds.length === 0) return `${bm?.count ?? 0} items`;
  if (bm.kinds.length === 1) return plural(bm.kinds[0], bm.count);
  return `${bm.count} items: ${bm.kinds.map((k) => singular(k)).join(', ')}`;
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
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize truncate max-w-[120px] ${STATUS_STYLES[level]}`}>
      {label}
    </span>
  );
}

// ─── Send box ─────────────────────────────────────────────────────────────────

const GSD_CHIPS = [
  "/gsd-next",
  "/gsd-resume-work",
  "/gsd-progress",
  "/gsd-pause-work",
  "/gsd-plan-phase",
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
        focused && isMobile ? "fixed left-0 right-0 border-t border-border z-[80]" : ""
      }`}
      style={focused && isMobile ? { bottom: 0, background: getTermTheme().background } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {contextTokens != null && contextTokens > 0 && <ContextBar tokens={contextTokens} />}
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

function SpecialKeyBar({
  wsRef,
  termRef,
  specialKeyPressRef,
}: {
  wsRef: React.RefObject<WebSocket | null>;
  termRef: React.RefObject<Terminal | null>;
  specialKeyPressRef: React.RefObject<boolean>;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  // Use native event listeners (not React synthetic) so preventDefault() fires
  // BEFORE the browser's focus management blurs the xterm textarea. React's
  // synthetic events are delegated to the root and fire too late on iOS Safari.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const onTouchStart = (e: TouchEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      e.preventDefault();
      const wasFocused = document.activeElement?.classList.contains('xterm-helper-textarea');
      specialKeyPressRef.current = true;
      const idx = parseInt(btn.getAttribute('data-idx') ?? '', 10);
      const key = SPECIAL_KEYS[idx];
      if (key) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(key.seq);
        }
        if (wasFocused) {
          termRef.current?.focus();
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      e.preventDefault();
      // Delay clearing the flag so the blur handler (which may fire after touchEnd
      // on iOS) still sees specialKeyPressRef=true and refocuses the terminal.
      setTimeout(() => { specialKeyPressRef.current = false; }, 150);
    };

    bar.addEventListener('touchstart', onTouchStart, { passive: false });
    bar.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      bar.removeEventListener('touchstart', onTouchStart);
      bar.removeEventListener('touchend', onTouchEnd);
    };
  }, [wsRef, termRef, specialKeyPressRef]);

  return (
    <div ref={barRef} className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-border/50">
      {SPECIAL_KEYS.map((key, i) => (
        <button
          key={key.label}
          data-idx={i}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          className="text-[11px] px-2.5 py-1.5 rounded border border-border bg-surface-3 text-gray-400 active:bg-accent/20 active:text-accent active:border-accent/30 transition-colors select-none"
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}

// ─── Theme-aware terminal colors ──────────────────────────────────────────────

function isLightMode() {
  return document.documentElement.classList.contains('light');
}

const TERM_THEMES = {
  dark:  { background: '#0d1117', foreground: '#c9d1d9', selectionBackground: 'rgba(99, 102, 241, 0.4)', overlay: 'rgba(0,0,0,0.9)', overlayText: 'rgba(13,17,23,0.92)' },
  light: { background: '#f5f5f5', foreground: '#24292e', selectionBackground: 'rgba(99, 102, 241, 0.35)', overlay: 'rgba(255,255,255,0.92)', overlayText: 'rgba(245,245,245,0.95)' },
} as const;

function getTermTheme() {
  return isLightMode() ? TERM_THEMES.light : TERM_THEMES.dark;
}

// ─── Terminal overlay ─────────────────────────────────────────────────────────

interface TerminalOverlayProps {
  projectName: string;
  wsBase: string | null;
  onClose: () => void;
  initialSendValue: string;
  inline?: boolean;
  onInfo?: () => void;
  contextTokens?: number | null;
}

function TerminalOverlay({ projectName, wsBase, onClose, initialSendValue, inline = false, onInfo, contextTokens }: TerminalOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [connected, setConnected] = useState(false);
  const [termFailed, setTermFailed] = useState(false);
  const reconnectRef = useRef<(() => void) | null>(null);
  // Stable ref so onClose never causes the effect to re-run (parent re-renders every 30s)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [isMobile] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const [bottomOffset, setBottomOffset] = useState(0);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const selectModeRef = useRef(false); // ref for use inside event handlers (avoids stale closure)
  const specialKeyPressRef = useRef(false); // true while a SpecialKeyBar button is being tapped
  const [pasteLabel, setPasteLabel] = useState<'Paste' | 'Pasted!'>('Paste');

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(text);
        setPasteLabel('Pasted!');
        setTimeout(() => setPasteLabel('Paste'), 1500);
      }
    } catch {
      // Clipboard read denied — silently ignore
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    // Cleanup callback set by the async setup — called by the synchronous cleanup below
    let cleanupFn: (() => void) | null = null;

    (async () => {
      if (!containerRef.current) return;

      // Build WebSocket URL — use tunnel base when in Railway proxy mode
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const base = wsBase ?? `${proto}//${window.location.host}`;
      const wsUrl = `${base}/ws/terminal/${encodeURIComponent(projectName)}`;

      // Dynamically import xterm to code-split it from the main bundle
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      await import("@xterm/xterm/css/xterm.css");

      if (cancelled || !containerRef.current) return;

      // Create terminal
      const tt = getTermTheme();
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: window.matchMedia('(pointer: coarse)').matches ? 10 : 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: { background: tt.background, foreground: tt.foreground, selectionBackground: tt.selectionBackground },
        scrollback: 0, // disable xterm scrollback — tmux owns all scrollback; prevents repeated-page bug
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      fitAddon.fit();
      setConnected(true);
      // On desktop, auto-focus so keyboard input goes to terminal immediately.
      // On mobile (touch devices), skip auto-focus to prevent iOS keyboard from
      // opening on load — user can tap terminal to focus when ready.
      if (!window.matchMedia('(pointer: coarse)').matches) {
        terminal.focus();
      }
      termRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Auto-reconnect state (TERM-02)
      const retryCountRef = { current: 0 };
      const MAX_RETRIES = 10;

      // Strip mouse-mode enable/disable sequences from pty output so xterm.js
      // never enters mouse reporting mode. This keeps local text selection and
      // scroll working. Tmux sends these when `set -g mouse on` is active.
      const MOUSE_MODE_RE = /\x1b\[\?(?:1000|1002|1003|1006|1015)[hl]/g;

      // Connect WebSocket — extracted so it can be called on initial mount and on reconnect.
      function connectWs(term: InstanceType<typeof Terminal>, url: string) {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          retryCountRef.current = 0;
          setConnected(true);
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        };

        ws.onmessage = (event) => {
          const data = typeof event.data === 'string' ? event.data.replace(MOUSE_MODE_RE, '') : event.data;
          term.write(data);
        };

        ws.onclose = (event) => {
          setConnected(false);
          if (event.code === 4004) {
            term.write('\r\n\x1b[31mSession is not active.\x1b[0m\r\n');
            return;
          }
          if (event.code === 4005) {
            term.write('\r\n\x1b[31mTerminal backend unavailable (node-pty not installed).\x1b[0m\r\n');
            return;
          }
          if (event.code === 1000) return; // clean close (e.g. user navigated away)
          if (cancelled) return; // component unmounted
          if (retryCountRef.current >= MAX_RETRIES) {
            setTermFailed(true);
            return;
          }
          retryCountRef.current += 1;
          term.write(`\r\n\x1b[33mReconnecting... (attempt ${retryCountRef.current})\x1b[0m\r\n`);
          setTimeout(() => {
            if (!cancelled) connectWs(term, url);
          }, 2000);
        };

        ws.onerror = () => {
          // Let onclose handle it — onerror always precedes onclose
        };

        return ws;
      }

      // Expose reconnect so the retry button can reset and reconnect without remounting
      reconnectRef.current = () => {
        retryCountRef.current = 0;
        setTermFailed(false);
        connectWs(terminal, wsUrl);
      };

      // Initial WebSocket connection
      connectWs(terminal, wsUrl);

      // Forward keystrokes to WS — selectively filter mouse sequences.
      // We strip mouse-mode enable from pty output (above) so xterm.js does local
      // text selection. But we still need to forward scroll events (SGR buttons
      // 64/65) to tmux so it scrolls its pane buffer on desktop.
      // On mobile, block ALL mouse sequences (beta generates NaN-coordinate garbage).
      // On desktop, block click/drag (buttons 0-2, 32-34) but allow scroll through.
      const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
      terminal.onData((data) => {
        const activeWs = wsRef.current;
        if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return;
        if (data.startsWith('\x1b[M')) return; // X10 — always block
        if (data.startsWith('\x1b[<')) {
          if (isTouchDevice) return; // mobile — block all SGR
          // Desktop: parse button number, allow scroll (64/65), block click/drag
          const btn = parseInt(data.slice(3), 10);
          if (isNaN(btn) || btn < 64) return;
        }
        activeWs.send(data);
      });

      // Copy selected text to clipboard automatically when selection changes
      terminal.onSelectionChange(() => {
        const sel = terminal.getSelection();
        if (sel) navigator.clipboard.writeText(sel).catch(() => {});
      });

      // Handle window resize
      const handleResize = () => {
        fitAddon.fit();
        const activeWs = wsRef.current;
        if (activeWs?.readyState === WebSocket.OPEN) {
          activeWs.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
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
        const activeWs = wsRef.current;
        if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return false;
        const fontSize = (terminal.options.fontSize as number) ?? 14;
        // Normalize to pixels first (deltaMode 1 = lines, 0 = pixels), then divide by 3× fontSize
        // so one standard wheel notch (≈100 px) sends ~2–3 lines instead of ~7.
        const pixelY = ev.deltaMode === 1 ? ev.deltaY * fontSize : ev.deltaY;
        const lines = Math.max(1, Math.round(Math.abs(pixelY) / (fontSize * 3)));
        const seq = ev.deltaY > 0 ? '\x1b[<65;1;1M' : '\x1b[<64;1;1M';
        for (let i = 0; i < lines; i++) activeWs.send(seq);
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
      const SCROLL_DAMPING = 6; // pixels of drag per tmux scroll line (higher = slower/more deliberate)
      const handleTouchMove = (e: TouchEvent) => {
        if (selectModeRef.current) return; // let xterm.js handle in select mode
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
        const activeWs = wsRef.current;
        for (let i = 0; i < lines; i++) {
          if (activeWs?.readyState === WebSocket.OPEN) activeWs.send(seq);
        }
      };
      // Tap to focus: call terminal.focus() on touchend when no scroll intent
      const handleTouchEnd = () => {
        if (selectModeRef.current) return; // don't steal focus/clear selection
        if (!scrollIntent) terminal.focus();
      };
      screen.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
      screen.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      screen.addEventListener('touchend', handleTouchEnd, { capture: true });

      // Track xterm textarea focus so mobile can hide SendBox when typing directly.
      // Debounce blur so that quick blur→focus cycles (caused by SpecialKeyBar taps)
      // never flip terminalFocused and flash the SendBox.
      const xtermTextarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
      let blurTimer = 0;
      const handleXtermFocus = () => {
        clearTimeout(blurTimer);
        setTerminalFocused(true);
      };
      const handleXtermBlur = () => {
        if (specialKeyPressRef.current) {
          // Special key tap caused this blur — immediately refocus to prevent keyboard flicker
          terminal.focus();
          return;
        }
        // Delay state change so a rapid refocus (e.g. from terminal.focus()) cancels it
        blurTimer = window.setTimeout(() => setTerminalFocused(false), 80);
      };
      xtermTextarea?.addEventListener('focus', handleXtermFocus);
      xtermTextarea?.addEventListener('blur', handleXtermBlur);

      // Register async cleanup for the synchronous cleanup function below
      cleanupFn = () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('keydown', handleKeyDown);
        screen.removeEventListener('touchstart', handleTouchStart, { capture: true } as EventListenerOptions);
        screen.removeEventListener('touchmove', handleTouchMove, { capture: true } as EventListenerOptions);
        screen.removeEventListener('touchend', handleTouchEnd, { capture: true } as EventListenerOptions);
        xtermTextarea?.removeEventListener('focus', handleXtermFocus);
        xtermTextarea?.removeEventListener('blur', handleXtermBlur);
        clearTimeout(blurTimer);
        wsRef.current?.close();
        terminal.dispose();
      };
    })();

    return () => {
      cancelled = true;
      cleanupFn?.();
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

  // Extract terminal buffer text for the selectable overlay
  const getTerminalText = (): string => {
    const term = termRef.current;
    if (!term) return '';
    const lines: string[] = [];
    const buffer = term.buffer.active;
    for (let i = 0; i < term.rows; i++) {
      const line = buffer.getLine(buffer.viewportY + i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join('\n');
  };

  const [bufferText, setBufferText] = useState('');

  const toggleSelectMode = () => {
    const next = !selectMode;
    selectModeRef.current = next;
    if (next) {
      // Entering select mode: snapshot the terminal buffer text
      setBufferText(getTerminalText());
    } else {
      // Exiting select mode: restore focus
      termRef.current?.focus();
    }
    setSelectMode(next);
  };

  return (
    <div
      className={`${inline ? 'relative' : 'fixed inset-0'} flex flex-col`}
      style={{ zIndex: inline ? undefined : 70, bottom: !inline && bottomOffset > 0 ? bottomOffset : undefined, overscrollBehavior: 'none', background: getTermTheme().overlay, ...(inline ? { height: '100%' } : {}) }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0" style={{ background: getTermTheme().background }}>
        <span className="text-sm text-gray-300 font-mono">{projectName} — tmux session</span>
        <div className="flex items-center gap-2">
          {isMobile && (
            <button
              onClick={handlePaste}
              className="text-xs px-2 py-1 rounded border transition-colors select-none bg-surface-3 text-gray-400 border-border hover:text-gray-900"
              aria-label="Paste clipboard into terminal"
            >
              {pasteLabel}
            </button>
          )}
          {isMobile && (
            <button
              onClick={toggleSelectMode}
              className={`text-xs px-2 py-1 rounded border transition-colors select-none ${
                selectMode
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'bg-surface-3 text-gray-400 border-border hover:text-gray-900'
              }`}
              aria-label={selectMode ? 'Exit select mode' : 'Enter select mode to copy text'}
            >
              {selectMode ? 'Done' : 'Select'}
            </button>
          )}
          {onInfo && (
            <button
              onClick={onInfo}
              className="p-1 rounded hover:bg-surface-3 text-gray-400 hover:text-gray-900 transition-colors"
              aria-label="Project info"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-3 text-gray-400 hover:text-gray-900 transition-colors"
            aria-label="Close terminal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Terminal container — fills remaining height */}
      <div className="flex-1 overflow-hidden relative" onWheel={(e) => e.stopPropagation()}>
        <div ref={containerRef} className="absolute inset-0 p-2" />
        {/* Connecting placeholder — visible until xterm canvas initializes */}
        {!connected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: getTermTheme().background, pointerEvents: termFailed ? 'auto' : 'none' }}>
            {termFailed ? (
              <>
                <span className="font-mono text-sm mb-3" style={{ color: '#ef4444' }}>Connection failed. Your network may be blocking this terminal.</span>
                <button
                  onClick={() => reconnectRef.current?.()}
                  className="px-3 py-1.5 text-xs rounded font-mono border border-gray-500 hover:border-gray-300 transition-colors"
                  style={{ color: getTermTheme().foreground }}
                >
                  Retry
                </button>
              </>
            ) : (
              <span className="font-mono text-sm" style={{ color: getTermTheme().foreground }}>Connecting to terminal...</span>
            )}
          </div>
        )}
        {/* Selectable text overlay — appears on top of terminal canvas in select mode */}
        {selectMode && (
          <pre
            className="absolute inset-0 p-2 overflow-auto select-text z-10"
            style={{
              fontFamily: 'Menlo, Monaco, "Courier New", monospace',
              fontSize: termRef.current?.options.fontSize ?? 10,
              lineHeight: 1.2,
              color: getTermTheme().foreground,
              background: getTermTheme().overlayText,
              whiteSpace: 'pre',
              WebkitUserSelect: 'text',
              userSelect: 'text',
              margin: 0,
            }}
          >
            {bufferText}
          </pre>
        )}
      </div>
      {/* Send box + special keys — mobile only (desktop has physical keyboard) */}
      {isMobile && (
        <div className="flex-shrink-0">
          {!terminalFocused && (
            <SendBox
              projectName={projectName}
              initialValue={initialSendValue}
              contextTokens={contextTokens ?? null}
            />
          )}
          <div aria-label="GSD command shortcuts">
            <CommandChips
              commands={[...GSD_CHIPS]}
              onSelect={(cmd) => api.gsd.send(projectName, cmd)}
            />
          </div>
          <SpecialKeyBar wsRef={wsRef} termRef={termRef} specialKeyPressRef={specialKeyPressRef} />
        </div>
      )}
    </div>
  );
}

// ─── Pure reducer for WebSocket project_state_change patches ─────────────────
// Exported for unit testing (see __tests__/patchProjectsOnStateChange.test.ts).
export function patchProjectsOnStateChange(
  projects: GsdProject[],
  evt: ProjectStateChangeEvent
): GsdProject[] {
  const idx = projects.findIndex((p) => p.name === evt.project);
  if (idx === -1) return projects;
  const next = projects.slice();
  // Phase 49: absence-as-clear. Server omits `busy_markers` when count===0,
  // so every broadcast is authoritative — copy when present, clear when absent.
  const patched = {
    ...projects[idx],
    sessionState: evt.sessionState,
    statusText: evt.statusText,
    currentTask: evt.currentTask,
    stateEnteredAt: evt.stateEnteredAt,
  } as GsdProject;
  if (evt.busy_markers) {
    patched.busy_markers = evt.busy_markers;
  } else {
    delete patched.busy_markers;
  }
  if ('verifyState' in evt) {
    patched.verifyState = evt.verifyState;
    patched.verifyFailureSummary = evt.verifyFailureSummary ?? null;
  } else {
    delete patched.verifyState;
    delete patched.verifyFailureSummary;
  }
  next[idx] = patched;
  return next;
}

// ─── Project card ─────────────────────────────────────────────────────────────

export function ProjectCard({
  project, nowMs, onSelect, onOpenTerminal, onArchive, onUnarchive, onPauseSession, onReopenTmux, autopilotRun
}: {
  project: GsdProject;
  nowMs: number;
  onSelect: (project: GsdProject) => void;
  onOpenTerminal: (initialValue: string) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onPauseSession: () => void;
  onReopenTmux: () => void;
  autopilotRun: import('../lib/types').AutopilotRun | null;
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
            <span
              className={`text-[11px] font-medium flex-shrink-0 ${stateConf.labelCls}`}
              title={project.busy_markers && project.busy_markers.count > 0 ? humanizeBusyMarkers(project.busy_markers) : undefined}
            >
              {stateConf.label}
              {project.stateEnteredAt && project.sessionState !== 'archived' && (
                <span className="ml-1 text-gray-500 font-normal">
                  {formatElapsed(project.stateEnteredAt, nowMs)}
                </span>
              )}
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
        {project.currentTask && (project.sessionState === 'working' || project.sessionState === 'waiting') && (
          <p className="text-xs text-gray-400 truncate pl-6 mt-0.5" title={project.currentTask}>
            {project.currentTask}
          </p>
        )}
      </div>

      {/* Terminal button — open when active, re-open when configured but dead */}
      {project.tmuxActive ? (
        <div className="mt-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.matchMedia('(pointer: coarse)').matches) {
                const tokens = project.contextTokens ?? '';
                window.open(`/terminal/${encodeURIComponent(project.name)}${tokens ? `?tokens=${tokens}` : ''}`, '_blank');
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

      {/* Verify state badge — Phase 53 */}
      {project.verifyState && (
        <div className="px-4 pb-1 pt-0" onClick={(e) => e.stopPropagation()}>
          <VerifyBadge project={project} />
        </div>
      )}

      {/* Autopilot controls — non-archived projects only */}
      {project.sessionState !== "archived" && (
        <div className="px-4 pb-3 pt-1">
          <AutopilotControls project={project} autopilotRun={autopilotRun} />
        </div>
      )}

      {/* Pause / Archive / Unarchive buttons */}
      {project.sessionState !== "archived" ? (
        <div className="px-4 pb-3 pt-1 flex gap-3" onClick={(e) => e.stopPropagation()}>
          {project.sessionState !== "paused" && (
            <button
              onClick={(e) => { e.stopPropagation(); onPauseSession(); }}
              className="text-[10px] text-red-600 hover:text-red-400 transition-colors"
            >
              Pause
            </button>
          )}
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

// ─── New project dialog ───────────────────────────────────────────────────────

interface NewProjectDialogProps {
  onClose: () => void;
  onCreated: (project: GsdProject) => void;
}

function NewProjectDialog({ onClose, onCreated }: NewProjectDialogProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { project } = await api.gsd.create(trimmed);
      // Build a minimal GsdProject shape for optimistic display
      const newProject: GsdProject = {
        name: project.name,
        root: project.root,
        state: null,
        roadmap: null,
        requirements: null,
        version: null,
        liveUrl: null,
        velocity: 0,
        streak: 0,
        estimatedCompletion: null,
        tmuxActive: true, // session was just created
        contextTokens: null,
        sessionUpdatedAt: null,
      };
      onCreated(newProject);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setSubmitting(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center"
      style={{ zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="bg-surface-2 border border-border rounded-xl p-6 w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-100 mb-1">New project</h3>
        <p className="text-xs text-gray-500 mb-4">
          Creates a directory, tmux session, and launches Claude with /gsd:new-project.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="project-name"
            className="w-full text-sm bg-surface-3 border border-border rounded px-3 py-2 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-accent/50"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="text-sm px-4 py-1.5 rounded bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function GSD() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const { widths, startDragLeft, startDragRight, isDragging } = useResizableColumns();
  const [projects, setProjects] = useState<GsdProject[]>([]);
  const [rateLimit, setRateLimit] = useState<{ active: boolean; resetAt: string | null }>({ active: false, resetAt: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<SessionState | null>("waiting");
  const [groupBy, setGroupBy] = useState<'state' | 'stage'>('state');

  // Stage grouping constants
  const STAGE_ORDER: ProjectStage[] = ['launched', 'beta', 'alpha', 'draft', 'maintenance', 'retired'];
  const STAGE_GROUP_HEADERS: Record<ProjectStage, string> = {
    launched: '🚀 Launched',
    beta: '🧪 Beta',
    alpha: '🔬 Alpha',
    draft: '📝 Draft',
    maintenance: '🔧 Maintenance',
    retired: '📦 Retired',
  };

  // Derive the selected project object from selectedProject name
  const selectedProj = selectedProject
    ? projects.find((p) => p.name === selectedProject) ?? null
    : null;
  const [autopilotRuns, setAutopilotRuns] = useState<Map<string, import('../lib/types').AutopilotRun>>(new Map());
  const [fullScreen, setFullScreen] = useState<{ content: string; title: string } | null>(null);
  const [terminalWsBase, setTerminalWsBase] = useState<string | null>(null);
  const [terminalKey, setTerminalKey] = useState(0);
  // Mobile info drawer uses a GsdProject object
  const [drawerProject, setDrawerProject] = useState<GsdProject | null>(null);
  const [pauseTarget, setPauseTarget] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  // Ref to track selected project name in the load() callback (which has [] deps)
  const selectedProjRef = useRef<string | null>(null);

  // Lock body scroll when terminal overlay is open (prevents background scroll on mobile)
  // On desktop, terminal is inline in the grid so no body lock needed.
  useEffect(() => {
    if (selectedProject && !isDesktop) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${window.scrollY}px`;
    } else if (!selectedProject) {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
  }, [selectedProject, isDesktop]);
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
      setRateLimit(data.rateLimit ?? { active: false, resetAt: null });
      setError(null);

      // Fetch autopilot status for selected project only (scoped to avoid N HTTP requests per poll)
      const currentProjName = selectedProjRef.current;
      if (currentProjName) {
        const s = await api.autopilot.status(currentProjName).catch(() => null);
        if (s && s.runId && s.status !== 'idle') {
          setAutopilotRuns(prev => {
            const next = new Map(prev);
            next.set(s.projectName, s);
            return next;
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GSD data");
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  const pauseSession = useCallback(async (name: string) => {
    try {
      await api.gsd.pauseSession(name);
      load();
    } catch { /* silent fail */ }
  }, [load]);

  const hardKillSession = useCallback(async (name: string) => {
    try {
      await api.gsd.killSession(name);
      load();
    } catch { /* silent fail */ }
  }, [load]);

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

  const handleProjectCreated = useCallback((project: GsdProject) => {
    setProjects((prev) => [project, ...prev]);
  }, []);

  // Fetch terminal WS base URL once on mount (null = use relative URL)
  useEffect(() => {
    api.gsd.wsBase().then(({ wsBase }) => setTerminalWsBase(wsBase ?? null)).catch(() => {});
  }, []);

  // Auto-load on mount + adaptive polling: 10s when active project is working, 60s otherwise (VIEW-06, WORK-02)
  // Chat window receives real-time messages via WebSocket; poll is just for project list metadata.
  useEffect(() => {
    load();
    const isWorking = selectedProj?.sessionState === 'working';
    const ms = isWorking ? 10_000 : 60_000;
    const interval = setInterval(() => load(), ms);
    return () => clearInterval(interval);
  }, [load, selectedProj?.sessionState]);

  // Keep selectedProjRef in sync so load() can use it without stale closure
  useEffect(() => {
    selectedProjRef.current = selectedProject;
  }, [selectedProject]);

  // Subscribe to project_state_change WS messages via eventBus
  // Patches the matching project in place — no refetch — for sub-second
  // visible updates to sessionState, statusText, currentTask, stateEnteredAt.
  useEffect(() => {
    const unsub = eventBus.subscribe((msg) => {
      if (msg.type === 'project_state_change') {
        const evt = msg.data as ProjectStateChangeEvent;
        setProjects((prev) => patchProjectsOnStateChange(prev, evt));
      }
    });
    return unsub;
  }, []);

  // Subscribe to project_creation_state WS messages — drives creation cards in ChatListView
  useProjectCreationStateSubscriber();

  // 1-second "now" tick for live-ticking elapsed-time labels. A single
  // useState<number> is cheap — React reconciles ~10 cards efficiently.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Subscribe to autopilot_progress WS messages via eventBus
  useEffect(() => {
    const unsub = eventBus.subscribe((msg) => {
      if (msg.type === 'autopilot_progress') {
        const evt = msg.data as import('../lib/types').AutopilotProgressEvent;
        setAutopilotRuns(prev => {
          const next = new Map(prev);
          // Map event statuses to AutopilotRunStatus:
          // - completed / halted / failed / queue_timeout → pass through as terminal statuses
          // - pending_confirmation / queued → pass through as pending statuses
          // - planning / executing / started / retrying → treat as 'running'
          let runStatus: import('../lib/types').AutopilotRunStatus;
          if (evt.status === 'completed') runStatus = 'completed';
          else if (evt.status === 'halted') runStatus = 'halted';
          else if (evt.status === 'failed') runStatus = 'failed';
          else if (evt.status === 'queue_timeout') runStatus = 'queue_timeout';
          else if (evt.status === 'pending_confirmation') runStatus = 'pending_confirmation';
          else if (evt.status === 'queued') runStatus = 'queued';
          else runStatus = 'running'; // planning, executing, started, retrying
          next.set(evt.projectName, {
            runId: evt.runId,
            status: runStatus,
            currentPhaseNum: evt.phaseNum,
            projectName: evt.projectName,
          });
          return next;
        });
      }
    });
    return unsub;
  }, []);

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

  // Filtered projects for chat list
  const filteredProjects = activeFilter === null
    ? projects.filter((p) => p.sessionState !== "archived")
    : projects.filter((p) => p.sessionState === activeFilter);

  const handleTerminalClose = useCallback(() => {
    setSelectedProject(null);
    load(false); // single refresh — WebSocket delivers real-time state changes
  }, [load]);

  // ─── Header (shared between layouts) ─────────────────────────────────────────
  const headerEl = (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-gray-100">GSD Projects</h2>
        <p className="text-sm text-gray-500">Unified view across all configured projects</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            const root = document.documentElement;
            const isLight = root.classList.toggle("light");
            root.classList.toggle("dark", !isLight);
            localStorage.setItem("theme", isLight ? "light" : "dark");
          }}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-3 border border-border transition-colors"
          title="Toggle light/dark mode"
        >
          <Sun className="w-3.5 h-3.5 hidden dark:block" />
          <Moon className="w-3.5 h-3.5 block dark:hidden" />
        </button>
        <button
          onClick={() => setShowNewProject(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-3 border border-border transition-colors"
        >
          + New project
        </button>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-3 border border-border transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
    </div>
  );

  // ─── Rate-limit banner (shared) ───────────────────────────────────────────────
  const rateLimitBanner = rateLimit.active ? (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-300 text-sm">
      <span className="text-orange-400 text-base">⚠</span>
      <span className="font-medium">Rate limit active across all sessions.</span>
      {rateLimitCountdown
        ? <span className="ml-1 text-orange-400 font-mono">Resets in {rateLimitCountdown}</span>
        : <span className="ml-1 text-orange-400/70">Reset time unknown — check your Anthropic plan.</span>
      }
    </div>
  ) : null;

  // ─── Desktop 3-column layout (>=1024px) ───────────────────────────────────────
  if (isDesktop) {
    return (
      <>
        <div className="animate-fade-in flex flex-col" style={{ height: 'calc(100dvh - 2rem)' }}>
          {/* Header above grid */}
          <div className="shrink-0 pb-3">
            {headerEl}
            {rateLimitBanner && <div className="mt-3">{rateLimitBanner}</div>}
          </div>

          {loading && (
            <div className="flex items-center justify-center flex-1 text-gray-500 text-sm">
              Loading project data…
            </div>
          )}

          {error && (
            <div className="card p-4 border-red-500/20 bg-red-500/5">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <div className={`flex flex-1 min-h-0 border border-border rounded-xl overflow-hidden ${isDragging ? 'select-none cursor-col-resize' : ''}`}>
              {/* Left: project list + filters — always visible */}
              <div
                className="flex flex-col border-r border-border overflow-hidden bg-surface-1 flex-shrink-0"
                style={{ width: `${widths.left}%` }}
              >
                <ChatListFilters
                  projects={projects}
                  activeFilter={activeFilter}
                  onFilterChange={setActiveFilter}
                  groupBy={groupBy}
                  onGroupByChange={setGroupBy}
                />
                <div className="flex-1 overflow-y-auto">
                  {groupBy === 'stage' ? (
                    <div className="flex flex-col gap-0">
                      {STAGE_ORDER.map((stage) => {
                        const stageProjects = projects.filter(p => {
                          if (p.sessionState === 'archived') return false;
                          return (p.stage ?? 'draft') === stage;
                        });
                        if (stageProjects.length === 0) return null;
                        return (
                          <div key={stage}>
                            <div className="px-4 py-2 bg-surface-2 border-b border-[var(--border)] text-xs font-semibold text-gray-400 sticky top-0 z-10">
                              {STAGE_GROUP_HEADERS[stage]}
                              <span className="ml-1.5 text-gray-600 font-normal">({stageProjects.length})</span>
                            </div>
                            <ChatListView
                              projects={stageProjects}
                              activeProject={selectedProject ?? undefined}
                              onSelectProject={(name) => setSelectedProject(name)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <ChatListView
                      projects={filteredProjects}
                      activeProject={selectedProject ?? undefined}
                      onSelectProject={(name) => setSelectedProject(name)}
                    />
                  )}
                </div>
              </div>

              {/* Drag handle: left | middle */}
              <div
                onMouseDown={startDragLeft}
                className={`w-1 flex-shrink-0 cursor-col-resize bg-border hover:bg-accent/60 transition-colors ${isDragging ? 'bg-accent/60' : ''}`}
                title="Drag to resize"
              />

              {/* Middle: terminal (always shown when project selected) */}
              <div className="flex flex-col overflow-hidden flex-1 min-w-0" style={{ overscrollBehavior: 'contain' }}>
                {selectedProject ? (
                  <TerminalOverlay
                    key={`${terminalKey}-${selectedProject}`}
                    projectName={selectedProject}
                    wsBase={terminalWsBase}
                    onClose={() => setSelectedProject(null)}
                    initialSendValue=""
                    inline={true}
                    contextTokens={selectedProj?.contextTokens}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                    Select a project to view its terminal
                  </div>
                )}
              </div>

              {/* Drag handle: middle | right */}
              <div
                onMouseDown={startDragRight}
                className={`w-1 flex-shrink-0 cursor-col-resize bg-border hover:bg-accent/60 transition-colors ${isDragging ? 'bg-accent/60' : ''}`}
                title="Drag to resize"
              />

              {/* Right: project details panel */}
              <div
                className="overflow-hidden flex-shrink-0"
                style={{ width: `${widths.right}%` }}
              >
                {selectedProj ? (
                  <ProjectDetailsPanel
                    project={selectedProj}
                    autopilotRun={autopilotRuns.get(selectedProj.name) ?? null}
                    onPauseSession={() => setPauseTarget(selectedProj.name)}
                    onArchive={() => archiveProject(selectedProj.name)}
                    onUnarchive={() => unarchiveProject(selectedProj.name)}
                    onOpenTerminal={() => {}}
                    onReopenTmux={() => { load(); setTerminalKey(k => k + 1); }}
                    onExpand={(content, tabId) => setFullScreen({ content, title: TAB_TITLES[tabId] ?? tabId })}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500 text-sm border-l border-border bg-surface-2">
                    Project details
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {fullScreen && (
          <MarkdownViewer
            content={fullScreen.content}
            title={fullScreen.title}
            onClose={() => setFullScreen(null)}
          />
        )}
        <PauseConfirmDialog
          projectName={pauseTarget}
          onClose={() => setPauseTarget(null)}
          onSendPauseWork={(name) => api.gsd.send(name, "/gsd-pause-work")}
          onJustPause={(name) => hardKillSession(name)}
        />
        {showNewProject && (
          <NewProjectDialog
            onClose={() => setShowNewProject(false)}
            onCreated={handleProjectCreated}
          />
        )}
      </>
    );
  }

  // ─── Mobile layout (<1024px) — terminal-first, info button opens drawer ────────
  return (
    <>
    <div className={`space-y-6 animate-fade-in ${selectedProject ? 'invisible h-0 overflow-hidden' : ''}`}>
      {headerEl}
      {rateLimitBanner}

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

      {/* Project list view */}
      {!loading && !error && (
        <div className="bg-surface-1 rounded-xl border border-border overflow-hidden">
          <ChatListFilters
            projects={projects}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
          />
          {groupBy === 'stage' ? (
            <div className="flex flex-col gap-0">
              {STAGE_ORDER.map((stage) => {
                const stageProjects = projects.filter(p => (p.stage ?? 'draft') === stage && p.sessionState !== 'archived');
                if (stageProjects.length === 0) return null;
                return (
                  <div key={stage}>
                    <div className="px-4 py-2 bg-surface-2 border-b border-[var(--border)] text-xs font-semibold text-gray-400 sticky top-0 z-10">
                      {STAGE_GROUP_HEADERS[stage]}
                      <span className="ml-1.5 text-gray-600 font-normal">({stageProjects.length})</span>
                    </div>
                    <ChatListView
                      projects={stageProjects}
                      onSelectProject={(name) => setSelectedProject(name)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <ChatListView
              projects={filteredProjects}
              onSelectProject={(name) => setSelectedProject(name)}
            />
          )}
        </div>
      )}

      {drawerProject && (
        <GsdDrawer
          project={drawerProject}
          autopilotRun={autopilotRuns.get(drawerProject.name) ?? null}
          onPauseSession={() => setPauseTarget(drawerProject.name)}
          onArchive={() => { archiveProject(drawerProject.name); setDrawerProject(null); setSelectedProject(null); }}
          onUnarchive={() => unarchiveProject(drawerProject.name)}
          onOpenTerminal={() => {}}
          onReopenTmux={() => { load(); setTerminalKey(k => k + 1); }}
          onClose={() => setDrawerProject(null)}
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
    <PauseConfirmDialog
      projectName={pauseTarget}
      onClose={() => setPauseTarget(null)}
      onSendPauseWork={(name) => api.gsd.send(name, "/gsd-pause-work")}
      onJustPause={(name) => hardKillSession(name)}
    />
    {showNewProject && (
      <NewProjectDialog
        onClose={() => setShowNewProject(false)}
        onCreated={handleProjectCreated}
      />
    )}
    {selectedProject && (
      <TerminalOverlay
        projectName={selectedProject}
        wsBase={terminalWsBase}
        onClose={handleTerminalClose}
        initialSendValue=""
        contextTokens={selectedProj?.contextTokens}
        onInfo={() => {
          const proj = projects.find((p) => p.name === selectedProject);
          if (proj) {
            setSelectedProject(null); // close terminal
            setDrawerProject(proj);   // open drawer
          }
        }}
      />
    )}
    </>
  );
}

// Standalone full-screen terminal page — used on mobile where the overlay
// approach is awkward; opens in a new browser tab via /terminal/:name
export function TerminalPage() {
  const { name } = useParams<{ name: string }>();
  const [wsBase, setWsBase] = useState<string | null>(null);

  useEffect(() => {
    api.gsd.wsBase().then(({ wsBase }) => setWsBase(wsBase ?? null)).catch(() => setWsBase(null));
  }, []);

  if (!name) return null;

  const tokensParam = new URLSearchParams(window.location.search).get('tokens');
  const contextTokens = tokensParam ? parseInt(tokensParam, 10) || null : null;

  return (
    <TerminalOverlay
      projectName={decodeURIComponent(name)}
      wsBase={wsBase}
      onClose={() => window.close()}
      initialSendValue=""
      contextTokens={contextTokens}
    />
  );
}
