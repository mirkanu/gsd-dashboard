import { useEffect } from "react";
import type { MutableRefObject, RefObject } from "react";

/**
 * SGR mouse button codes for scroll events.
 * See ECMA-48 §5.5 — SGR mouse encoding.
 */
const SGR_SCROLL_UP = 64; // wheel toward earlier history
const SGR_SCROLL_DOWN = 65; // wheel toward latest content

interface UseTerminalTouchScrollOptions {
  /** Outer container div ref — the hook listens on `.xterm-screen` inside it. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** xterm.js terminal ref — used to read fontSize, cols, rows for the SGR sequence. */
  terminalRef: RefObject<{ options: { fontSize?: number }; rows: number; cols: number; focus: () => void } | null>;
  /** WebSocket ref — SGR sequences are sent here so tmux scrolls its own viewport. */
  wsRef: MutableRefObject<WebSocket | null>;
  /** When true (select mode), the hook is a no-op and xterm.js's own touch handling wins. */
  selectModeRef: MutableRefObject<boolean>;
  /**
   * Pixels of drag per tmux scroll line. Higher = slower / more deliberate.
   * The mouse-wheel handler in the parent uses `fontSize * 3`; touch wants ~2× that
   * because finger drags are noisier than wheel notches.
   */
  scrollDampingPxPerLine?: number;
  /** Pixels of movement before scroll intent is determined (kills accidental scrolls on tap). */
  intentThresholdPx?: number;
  /** Fired the first time a scroll gesture is recognized — useful for hiding "swipe to scroll" hints. */
  onFirstScroll?: () => void;
}

/**
 * Mobile swipe-to-scroll for the power-mode terminal overlay.
 *
 * Background:
 *   - xterm.js is configured with `scrollback: 0` here because tmux owns all
 *     history. So xterm's *local* scrollback is empty and there is nothing
 *     for xterm to scroll on its own.
 *   - xterm's built-in touch scroll (when scrollback=0) routes via arrow keys,
 *     which only moves the cursor — they don't make the tmux viewport scroll.
 *   - We need SGR mouse-wheel sequences (button 64/65) sent to tmux, which
 *     interprets them when `set -g mouse on` is in effect (the project default)
 *     and scrolls its own viewport in response.
 *
 * Mechanism:
 *   - Listen for `touchstart`/`move`/`end`/`cancel` on `.xterm-screen` (where
 *     xterm's GestureManager also binds its own listeners) in *capture* phase.
 *   - On `touchstart` record clientX/Y and the touch identifier.
 *   - On `touchmove`, once vertical travel exceeds the threshold and dominates
 *     horizontal travel, claim "scroll intent" and emit SGR scroll sequences
 *     per the drag distance. Stop propagation so xterm doesn't see the event.
 *   - On `touchend`, if scroll intent was never claimed, treat as a tap and
 *     focus the terminal (mobile keyboard trigger).
 *   - On `touchcancel`, drop any partial state.
 *
 * Returning `void`; behavior is observable by spying on `wsRef.current.send`.
 */
export function useTerminalTouchScroll({
  containerRef,
  terminalRef,
  wsRef,
  selectModeRef,
  scrollDampingPxPerLine = 6,
  intentThresholdPx = 5,
  onFirstScroll,
}: UseTerminalTouchScrollOptions): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // xterm.js renders its own touch listeners on .xterm-screen; we attach on
    // the same element in capture phase so our handler fires FIRST. On the
    // container fallback path we still beat xterm's bubble-phase listener
    // because capture on container fires before bubble on .xterm-screen.
    const screen = (container.querySelector('.xterm-screen') as HTMLElement | null) ?? container;

    // touch-action: none disables the browser's own touch interpretation on
    // this element (viewport pan, pinch-zoom, double-tap-zoom). Without this,
    // iOS Safari starts scrolling the page in the same frame as touchmove
    // before our capture-phase handler can call preventDefault().
    // We save and restore the original so we don't fight an outer style.
    const originalTouchAction = screen.style.touchAction;
    screen.style.touchAction = 'none';

    let touchStartY = 0;
    let touchStartX = 0;
    let scrollIntent = false;
    let activeTouchId: number | null = null;
    let firstScrollFired = false;

    const handleTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      activeTouchId = t.identifier;
      touchStartY = t.clientY;
      touchStartX = t.clientX;
      scrollIntent = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (selectModeRef.current) return;
      if (activeTouchId === null) return;

      // Find the original touch in either list (changedTouches during move is
      // browser-dependent).
      const t =
        e.changedTouches[0] && e.changedTouches[0].identifier === activeTouchId
          ? e.changedTouches[0]
          : Array.from(e.touches).find((x) => x.identifier === activeTouchId);
      if (!t) return;

      const dy = touchStartY - t.clientY; // positive = finger moved up
      const dx = touchStartX - t.clientX; // positive = finger moved left

      if (!scrollIntent) {
        if (Math.abs(dy) < intentThresholdPx) return;
        scrollIntent = Math.abs(dy) >= Math.abs(dx);
      }
      if (!scrollIntent) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      touchStartY = t.clientY;
      touchStartX = t.clientX;

      const terminal = terminalRef.current;
      if (!terminal) return;

      const fontSize = terminal.options.fontSize ?? 10;
      const lines = Math.max(1, Math.abs(Math.round(dy / (fontSize * scrollDampingPxPerLine))));
      const row = Math.floor(terminal.rows / 2);
      const col = Math.floor(terminal.cols / 2);
      // Finger up (dy > 0) => scroll up (button 64) — see header comment.
      const button = dy > 0 ? SGR_SCROLL_UP : SGR_SCROLL_DOWN;
      const seq = `\x1b[<${button};${col};${row}M`;

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      for (let i = 0; i < lines; i++) ws.send(seq);

      if (!firstScrollFired) {
        firstScrollFired = true;
        onFirstScroll?.();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Only react to the touch that started, and only if there was no scroll.
      const ended = e.changedTouches[0];
      if (!ended || ended.identifier !== activeTouchId) return;
      const wasScrolling = scrollIntent;
      activeTouchId = null;
      scrollIntent = false;
      if (wasScrolling) return;
      if (selectModeRef.current) return; // never steal focus during text-selection
      terminalRef.current?.focus();
    };

    const handleTouchCancel = (e: TouchEvent) => {
      const canceled = e.changedTouches[0];
      if (!canceled || canceled.identifier !== activeTouchId) return;
      activeTouchId = null;
      scrollIntent = false;
    };

    const opts = { capture: true } as AddEventListenerOptions;
    screen.addEventListener('touchstart', handleTouchStart, { ...opts, passive: true });
    screen.addEventListener('touchmove', handleTouchMove, { ...opts, passive: false });
    screen.addEventListener('touchend', handleTouchEnd, opts);
    screen.addEventListener('touchcancel', handleTouchCancel, opts);

    return () => {
      screen.style.touchAction = originalTouchAction;
      screen.removeEventListener('touchstart', handleTouchStart, { capture: true } as EventListenerOptions);
      screen.removeEventListener('touchmove', handleTouchMove, { capture: true } as EventListenerOptions);
      screen.removeEventListener('touchend', handleTouchEnd, { capture: true } as EventListenerOptions);
      screen.removeEventListener('touchcancel', handleTouchCancel, { capture: true } as EventListenerOptions);
    };
  }, [containerRef, terminalRef, wsRef, selectModeRef, scrollDampingPxPerLine, intentThresholdPx, onFirstScroll]);
}
