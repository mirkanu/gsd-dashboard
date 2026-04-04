import { useEffect, useRef, useState, useCallback } from "react";
import { eventBus } from "../lib/eventBus";
import { useParams } from "react-router-dom";
import {
  RefreshCw,
  MapPin,
  ExternalLink,
  X,
  ClipboardPaste,
  Sun,
  Moon,
} from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "../lib/api";
import type { GsdProject, SessionState } from "../lib/types";
import { GsdDrawer } from "../components/GsdDrawer";
import { MarkdownViewer } from "../components/MarkdownViewer";
import { ChatListView } from "../components/ChatListView";
import { ChatListFilters } from "../components/ChatListFilters";

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
        focused && isMobile ? "fixed left-0 right-0 border-t border-border z-[80]" : ""
      }`}
      style={focused && isMobile ? { bottom: 0, background: getTermTheme().background } : undefined}
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
      specialKeyPressRef.current = true;
      const idx = parseInt(btn.getAttribute('data-idx') ?? '', 10);
      const key = SPECIAL_KEYS[idx];
      if (key) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(key.seq);
        }
        termRef.current?.focus();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      e.preventDefault();
      specialKeyPressRef.current = false;
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
  dark:  { background: '#0d1117', foreground: '#c9d1d9', overlay: 'rgba(0,0,0,0.9)', overlayText: 'rgba(13,17,23,0.92)' },
  light: { background: '#f5f5f5', foreground: '#24292e', overlay: 'rgba(255,255,255,0.92)', overlayText: 'rgba(245,245,245,0.95)' },
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

    // Build WebSocket URL — use tunnel base when in Railway proxy mode
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = wsBase ?? `${proto}//${window.location.host}`;
    const wsUrl = `${base}/ws/terminal/${encodeURIComponent(projectName)}`;

    // Create terminal
    const tt = getTermTheme();
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: window.matchMedia('(pointer: coarse)').matches ? 10 : 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: tt.background, foreground: tt.foreground },
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
      for (let i = 0; i < lines; i++) {
        if (ws.readyState === WebSocket.OPEN) ws.send(seq);
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

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      screen.removeEventListener('touchstart', handleTouchStart, { capture: true } as EventListenerOptions);
      screen.removeEventListener('touchmove', handleTouchMove, { capture: true } as EventListenerOptions);
      screen.removeEventListener('touchend', handleTouchEnd, { capture: true } as EventListenerOptions);
      xtermTextarea?.removeEventListener('focus', handleXtermFocus);
      xtermTextarea?.removeEventListener('blur', handleXtermBlur);
      clearTimeout(blurTimer);
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
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: 70, bottom: bottomOffset > 0 ? bottomOffset : undefined, overscrollBehavior: 'none', background: getTermTheme().overlay }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0" style={{ background: getTermTheme().background }}>
        <span className="text-sm text-gray-300 font-mono">{projectName} — tmux session</span>
        <div className="flex items-center gap-2">
          {isMobile && (
            <button
              onClick={handlePaste}
              className="text-xs px-2 py-1 rounded border transition-colors select-none bg-surface-3 text-gray-400 border-border hover:text-white"
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
                  : 'bg-surface-3 text-gray-400 border-border hover:text-white'
              }`}
              aria-label={selectMode ? 'Exit select mode' : 'Enter select mode to copy text'}
            >
              {selectMode ? 'Done' : 'Select'}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-3 text-gray-400 hover:text-white transition-colors"
            aria-label="Close terminal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Terminal container — fills remaining height */}
      <div className="flex-1 overflow-hidden relative">
        <div ref={containerRef} className="absolute inset-0 p-2" />
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
              contextTokens={null}
            />
          )}
          <SpecialKeyBar wsRef={wsRef} termRef={termRef} specialKeyPressRef={specialKeyPressRef} />
        </div>
      )}
    </div>
  );
}

// ─── Autopilot controls ───────────────────────────────────────────────────────

function AutopilotControls({ project, autopilotRun }: {
  project: GsdProject;
  autopilotRun: import('../lib/types').AutopilotRun | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const status = autopilotRun?.status ?? 'idle';

  // Seed pendingCommand from status API response (e.g. on page load)
  useEffect(() => {
    if (autopilotRun?.status === 'pending_confirmation' && autopilotRun.pendingCommand) {
      setPendingCommand(autopilotRun.pendingCommand);
    }
  }, [autopilotRun]);

  const showError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Request failed';
    setError(msg);
    setTimeout(() => setError(null), 4000);
  };

  // Subscribe to autopilot_progress to capture pendingCommand label
  useEffect(() => {
    const unsub = eventBus.subscribe((msg) => {
      if (msg.type === 'autopilot_progress') {
        const evt = msg.data as import('../lib/types').AutopilotProgressEvent;
        if (evt.projectName !== project.name) return;
        if (evt.status === 'pending_confirmation' && evt.pendingCommand) {
          setPendingCommand(evt.pendingCommand);
        } else if (evt.status !== 'pending_confirmation') {
          setPendingCommand(null);
        }
      }
    });
    return unsub;
  }, [project.name]);

  const handlePlanAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!window.confirm(`Plan all remaining phases for "${project.name}"?`)) return;
    setBusy(true);
    try { await api.autopilot.planAll(project.name); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!window.confirm(`Start autopilot for "${project.name}"? This will plan and execute all remaining phases automatically.`)) return;
    setBusy(true);
    try {
      const result = await api.autopilot.start(project.name);
      // Optimistic update — set status to running immediately so UI reflects it
      if (result.runId) {
        eventBus.publish({
          type: 'autopilot_progress',
          data: { projectName: project.name, runId: result.runId, status: 'started', phaseNum: null },
        } as any);
      }
    }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const handlePause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try { await api.autopilot.pause(project.name); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const handleResume = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try { await api.autopilot.resume(project.name); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try { await api.autopilot.confirm(project.name); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try { await api.autopilot.pause(project.name); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  return (
    <div className="px-4 pb-3 pt-1 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {/* Plan All — visible when idle/completed/failed/queue_timeout */}
      {(status === 'idle' || status === 'completed' || status === 'failed' || status === 'queue_timeout') ? (
        <button
          onClick={handlePlanAll}
          disabled={busy}
          className="text-[10px] px-2 py-1 rounded border border-border text-gray-500 hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-40"
        >
          Plan All
        </button>
      ) : null}

      {/* Run Autopilot / Pause / Resume / Confirmation UI */}
      {(status === 'idle' || status === 'completed' || status === 'failed' || status === 'queue_timeout') ? (
        <button
          onClick={handleStart}
          disabled={busy}
          className="text-[10px] px-2 py-1 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
        >
          {busy ? 'Starting…' : 'Run Autopilot'}
        </button>
      ) : status === 'pending_confirmation' ? (
        <div className="w-full flex flex-col gap-1.5 py-1">
          <p className="text-[10px] text-gray-400">
            Ready to send: <span className="font-mono text-accent">{pendingCommand ?? '/gsd:execute-phase'}</span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="text-[10px] px-2.5 py-1 rounded border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
            >
              {busy ? '…' : 'Confirm'}
            </button>
            <button
              onClick={handleCancel}
              disabled={busy}
              className="text-[10px] px-2.5 py-1 rounded border border-border text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (status === 'running' || status === 'queued') ? (
        <button
          onClick={handlePause}
          disabled={busy}
          className="text-[10px] px-2 py-1 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
        >
          {busy ? '…' : 'Pause'}
        </button>
      ) : status === 'paused' ? (
        <button
          onClick={handleResume}
          disabled={busy}
          className="text-[10px] px-2 py-1 rounded border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
        >
          {busy ? '…' : 'Resume'}
        </button>
      ) : null}

      {/* Status indicator */}
      {status === 'running' && (
        <span className="text-[10px] text-emerald-400 animate-pulse">
          {autopilotRun?.currentPhaseNum != null ? `Phase ${autopilotRun.currentPhaseNum}…` : 'Starting…'}
        </span>
      )}
      {status === 'paused' && (
        <span className="text-[10px] text-amber-400">Paused</span>
      )}
      {status === 'halted' && (
        <span className="text-[10px] text-red-400">Circuit open</span>
      )}
      {status === 'queued' && (
        <span className="text-[10px] text-amber-400 animate-pulse">Queued — waiting for idle…</span>
      )}
      {status === 'queue_timeout' && (
        <span className="text-[10px] text-red-400">Queue timeout — session was busy</span>
      )}

      {error && (
        <p className="text-xs text-red-400 w-full mt-1 truncate" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project, onSelect, onOpenTerminal, onArchive, onUnarchive, onPauseSession, onReopenTmux, autopilotRun
}: {
  project: GsdProject;
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

      {/* Autopilot controls — non-archived projects only */}
      {project.sessionState !== "archived" && (
        <AutopilotControls project={project} autopilotRun={autopilotRun} />
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

// ─── Main page ────────────────────────────────────────────────────────────────

export function GSD() {
  const [projects, setProjects] = useState<GsdProject[]>([]);
  const [rateLimit, setRateLimit] = useState<{ active: boolean; resetAt: string | null }>({ active: false, resetAt: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProject, setSelectedProject] = useState<GsdProject | null>(null);
  const [chatView, setChatView] = useState<{ view: 'list' | 'chat'; project?: string }>({ view: 'list' });
  const [activeFilter, setActiveFilter] = useState<SessionState | null>("waiting");
  const [autopilotRuns, setAutopilotRuns] = useState<Map<string, import('../lib/types').AutopilotRun>>(new Map());
  const [fullScreen, setFullScreen] = useState<{ content: string; title: string } | null>(null);
  const [terminalProject, setTerminalProject] = useState<string | null>(null);
  const [terminalWsBase, setTerminalWsBase] = useState<string | null>(null);
  const [terminalInitialValue, setTerminalInitialValue] = useState<string>("");
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lock body scroll when terminal overlay is open (prevents background scroll on mobile)
  useEffect(() => {
    if (terminalProject) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${window.scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
  }, [terminalProject]);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      // Fetch autopilot status for all non-archived projects
      const nonArchived = data.projects.filter((p: GsdProject) => p.sessionState !== 'archived');
      const statuses = await Promise.all(
        nonArchived.map((p: GsdProject) => api.autopilot.status(p.name).catch(() => null))
      );
      setAutopilotRuns(prev => {
        const next = new Map(prev);
        statuses.forEach((s) => {
          if (s && s.runId && s.status !== 'idle') {
            next.set(s.projectName, s);
          }
        });
        return next;
      });
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

  // Cleanup polling burst refs on unmount (UX-02)
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
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

  return (
    <>
    <div className={`space-y-6 animate-fade-in ${terminalProject ? 'invisible h-0 overflow-hidden' : ''}`}>
      {/* Header */}
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
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-3 border border-border transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
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

      {/* Chat list view */}
      {!loading && !error && chatView.view === 'list' && (() => {
        const filtered = activeFilter === null
          ? projects.filter((p) => p.sessionState !== "archived")
          : projects.filter((p) => p.sessionState === activeFilter);
        return (
          <div className="bg-surface-1 rounded-xl border border-border overflow-hidden">
            <ChatListFilters
              projects={projects}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
            />
            <ChatListView
              projects={filtered}
              onSelectProject={(name) => {
                setChatView({ view: 'chat', project: name });
              }}
            />
          </div>
        );
      })()}

      {/* Chat placeholder — selected project (Phase 30 will replace with real chat) */}
      {!loading && !error && chatView.view === 'chat' && (() => {
        const proj = projects.find((p) => p.name === chatView.project);
        const displayName = proj?.display_name || chatView.project;
        return (
          <div className="flex-1 flex flex-col">
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setChatView({ view: 'list' }); setSelectedProject(null); }}
                  className="text-gray-400 hover:text-gray-200 transition-colors"
                >
                  ←
                </button>
                <span className="font-semibold text-gray-200">{displayName}</span>
                {proj?.sessionState && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    proj.sessionState === 'working' ? 'bg-emerald-500/20 text-emerald-400' :
                    proj.sessionState === 'waiting' ? 'bg-amber-400/20 text-amber-400' :
                    proj.sessionState === 'paused' ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-600/20 text-gray-500'
                  }`}>{proj.sessionState}</span>
                )}
              </div>
            </div>

            {/* Placeholder body */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20 text-gray-500">
              <p className="text-sm">Chat view coming in Phase 30</p>

              {/* Action buttons */}
              <div className="flex flex-wrap justify-center gap-2">
                {proj?.tmuxActive && (
                  <button
                    onClick={() => {
                      if (window.matchMedia('(pointer: coarse)').matches) {
                        window.open(`/terminal/${encodeURIComponent(proj.name)}`, '_blank');
                      } else {
                        setTerminalProject(chatView.project!);
                        setTerminalInitialValue("");
                      }
                    }}
                    className="px-4 py-2 rounded-lg text-sm border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  >
                    Open Terminal
                  </button>
                )}
                {proj && proj.sessionState === 'paused' && (
                  <button
                    onClick={async () => {
                      try { await api.gsd.reopenTmux(proj.name); load(); } catch {}
                    }}
                    className="px-4 py-2 rounded-lg text-sm border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors"
                  >
                    Re-open
                  </button>
                )}
                <button
                  onClick={() => {
                    const p = projects.find((pr) => pr.name === chatView.project) ?? null;
                    setSelectedProject(p);
                  }}
                  className="px-4 py-2 rounded-lg text-sm border border-border text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
                >
                  Project Details
                </button>
              </div>

              {/* Secondary actions */}
              <div className="flex flex-wrap justify-center gap-3">
                {proj && proj.sessionState !== 'paused' && proj.sessionState !== 'archived' && (
                  <button
                    onClick={() => { pauseSession(proj.name); }}
                    className="text-[11px] text-red-500 hover:text-red-400 transition-colors"
                  >
                    Pause
                  </button>
                )}
                {proj && proj.sessionState !== 'archived' && (
                  <button
                    onClick={() => { archiveProject(proj.name); setChatView({ view: 'list' }); }}
                    className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    Archive
                  </button>
                )}
                {proj && proj.sessionState === 'archived' && (
                  <button
                    onClick={() => { unarchiveProject(proj.name); }}
                    className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Unarchive
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
    {terminalProject && (
      <TerminalOverlay
        projectName={terminalProject}
        wsBase={terminalWsBase}
        onClose={() => {
          setTerminalProject(null);
          setTerminalInitialValue("");
          // Polling burst: refresh card state every 500ms for 2s after terminal closes.
          // This ensures the card badge (Working/Waiting/Paused) reflects the actual
          // post-close state within the same interaction, not the next 30s poll.
          if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
          if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
          refreshIntervalRef.current = setInterval(() => load(false), 500);
          refreshTimeoutRef.current = setTimeout(() => {
            if (refreshIntervalRef.current) {
              clearInterval(refreshIntervalRef.current);
              refreshIntervalRef.current = null;
            }
          }, 2000);
        }}
        initialSendValue={terminalInitialValue}
      />
    )}
    </>
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
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: getTermTheme().background }}>
      <span className="font-mono text-sm" style={{ color: getTermTheme().foreground }}>Connecting…</span>
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
