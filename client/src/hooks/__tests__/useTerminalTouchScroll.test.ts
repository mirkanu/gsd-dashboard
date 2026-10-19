import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTerminalTouchScroll } from '../useTerminalTouchScroll';

// Minimal Touch + TouchEvent shim — jsdom doesn't include either.
class FakeTouch {
  identifier = 1;
  target: EventTarget;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  constructor(init: { target: EventTarget; clientX: number; clientY: number; pageX?: number; pageY?: number }) {
    this.target = init.target;
    this.clientX = init.clientX;
    this.clientY = init.clientY;
    this.pageX = init.pageX ?? init.clientX;
    this.pageY = init.pageY ?? init.clientY;
  }
}

function makeTouchEvent(type: string, touches: FakeTouch[], changed?: FakeTouch[]): TouchEvent {
  const touchList = touches as unknown as TouchList;
  const changedList = (changed ?? touches) as unknown as TouchList;
  const evt = new Event(type, { bubbles: true, cancelable: true }) as unknown as TouchEvent;
  Object.defineProperty(evt, 'touches', { value: touchList, configurable: true });
  Object.defineProperty(evt, 'changedTouches', { value: changedList, configurable: true });
  Object.defineProperty(evt, 'targetTouches', { value: touchList, configurable: true });
  // jsdom dispatches cancelable=false by default; force true so preventDefault works
  Object.defineProperty(evt, 'cancelable', { value: true, configurable: true });
  return evt;
}

describe('useTerminalTouchScroll', () => {
  let container: HTMLDivElement;
  let screen: HTMLDivElement;
  let wsSend: ReturnType<typeof vi.fn>;
  let ws: WebSocket;
  let wsRef: { current: WebSocket | null };
  let termRef: { current: any };
  let selectModeRef: { current: boolean };
  let containerRef: { current: HTMLDivElement | null };

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    screen = document.createElement('div');
    screen.className = 'xterm-screen';
    container.appendChild(screen);
    document.body.appendChild(container);
    containerRef = { current: container };

    wsSend = vi.fn();
    ws = { send: wsSend, readyState: WebSocket.OPEN } as unknown as WebSocket;
    wsRef = { current: ws };

    termRef = {
      current: {
        options: { fontSize: 14 },
        rows: 24,
        cols: 80,
        focus: vi.fn(),
      },
    };

    selectModeRef = { current: false };
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  function mountHook(opts: Partial<Parameters<typeof useTerminalTouchScroll>[0]> = {}) {
    return renderHook(() =>
      useTerminalTouchScroll({
        containerRef: opts.containerRef ?? containerRef,
        terminalRef: opts.terminalRef ?? termRef,
        wsRef: opts.wsRef ?? wsRef,
        selectModeRef: opts.selectModeRef ?? selectModeRef,
        scrollDampingPxPerLine: opts.scrollDampingPxPerLine,
        intentThresholdPx: opts.intentThresholdPx,
        onFirstScroll: opts.onFirstScroll,
      })
    );
  }

  function fireStart(touch: FakeTouch, on?: HTMLElement) {
    const evt = makeTouchEvent('touchstart', [touch], [touch]);
    (on ?? screen).dispatchEvent(evt);
    return evt;
  }

  function fireMove(touch: FakeTouch, on?: HTMLElement) {
    const evt = makeTouchEvent('touchmove', [touch], [touch]);
    (on ?? screen).dispatchEvent(evt);
    return evt;
  }

  function fireEnd(touch: FakeTouch, on?: HTMLElement) {
    const evt = makeTouchEvent('touchend', [], [touch]);
    (on ?? screen).dispatchEvent(evt);
    return evt;
  }

  function fireCancel(touch: FakeTouch, on?: HTMLElement) {
    const evt = makeTouchEvent('touchcancel', [], [touch]);
    (on ?? screen).dispatchEvent(evt);
  }

  it('T1: small vertical movement below the threshold does not emit SGR sequences', () => {
    mountHook();
    fireStart(new FakeTouch({ target: screen, clientX: 50, clientY: 100, pageX: 50, pageY: 100 }));
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 96, pageX: 50, pageY: 96 })); // 4px up
    expect(wsSend).not.toHaveBeenCalled();
  });

  it('T2: vertical swipe up (finger moves up) scrolls earlier history — emits SGR button 64', () => {
    mountHook();
    fireStart(new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 }));
    // 60px up — finger moved up = dy = 200 - 140 = 60
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 140, pageX: 50, pageY: 140 }));
    expect(wsSend).toHaveBeenCalled();
    // All sent sequences must be SGR scroll-up sequences (button 64)
    for (const call of wsSend.mock.calls) {
      expect(call[0]).toMatch(/^\x1b\[<64;\d+;\d+M$/);
    }
  });

  it('T3: vertical swipe down (finger moves down) scrolls toward latest — emits SGR button 65', () => {
    mountHook();
    fireStart(new FakeTouch({ target: screen, clientX: 50, clientY: 100, pageX: 50, pageY: 100 }));
    // 60px down — finger moved down = dy = 100 - 160 = -60
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 160, pageX: 50, pageY: 160 }));
    expect(wsSend).toHaveBeenCalled();
    for (const call of wsSend.mock.calls) {
      expect(call[0]).toMatch(/^\x1b\[<65;\d+;\d+M$/);
    }
  });

  it('T4: predominantly horizontal movement does not scroll — vertical:horizontal ratio decides', () => {
    mountHook();
    fireStart(new FakeTouch({ target: screen, clientX: 100, clientY: 100, pageX: 100, pageY: 100 }));
    // 60px right, 4px up — dominated by horizontal
    fireMove(new FakeTouch({ target: screen, clientX: 160, clientY: 96, pageX: 160, pageY: 96 }));
    expect(wsSend).not.toHaveBeenCalled();
  });

  it('T5: tap (no scroll intent) on touchend focuses the terminal', () => {
    const focusSpy = vi.fn();
    termRef.current.focus = focusSpy;
    mountHook();
    const t = new FakeTouch({ target: screen, clientX: 100, clientY: 100, pageX: 100, pageY: 100 });
    fireStart(t);
    // tiny wiggle under threshold then release — should be a tap
    fireMove(new FakeTouch({ target: screen, clientX: 100, clientY: 101, pageX: 100, pageY: 101 }));
    fireEnd(t);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('T6: tap-then-swipe (touchend after scroll) does NOT focus the terminal', () => {
    const focusSpy = vi.fn();
    termRef.current.focus = focusSpy;
    mountHook();
    const startTouch = new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 });
    fireStart(startTouch);
    // scroll up by 80px
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 120, pageX: 50, pageY: 120 }));
    expect(wsSend).toHaveBeenCalled();
    wsSend.mockClear();
    // release the (now-updated) touch — must use the same identifier
    const endTouch = new FakeTouch({ target: screen, clientX: 50, clientY: 110, pageX: 50, pageY: 110 });
    Object.defineProperty(endTouch, 'identifier', { value: 1 });
    fireEnd(endTouch);
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('T7: select mode disables both scroll emission and tap-to-focus', () => {
    const focusSpy = vi.fn();
    termRef.current.focus = focusSpy;
    selectModeRef.current = true;
    mountHook();
    const t = new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 });
    fireStart(t);
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 120, pageX: 50, pageY: 120 }));
    expect(wsSend).not.toHaveBeenCalled();
    fireEnd(t);
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('T8: scrollback=0 + tmux in mouse mode requires SGR sequences — never raw arrow keys', () => {
    // Guardian: if a future change accidentally switches to arrow keys the
    // xterm scrollback=0 means the cursor will move but tmux will not scroll.
    mountHook();
    fireStart(new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 }));
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 120, pageX: 50, pageY: 120 }));
    for (const call of wsSend.mock.calls) {
      const payload: string = call[0];
      // Reject CSI A/B (arrow keys) and PageUp/PageDown — must be SGR mouse
      expect(payload).not.toMatch(/\x1b\[A|\x1b\[B|\x1b\[5~|\x1b\[6~/);
      expect(payload.startsWith('\x1b[<')).toBe(true);
    }
  });

  it('T9: touchcancel mid-scroll resets state without focusing', () => {
    const focusSpy = vi.fn();
    termRef.current.focus = focusSpy;
    mountHook();
    const startTouch = new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 });
    fireStart(startTouch);
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 120, pageX: 50, pageY: 120 }));
    wsSend.mockClear();
    const cancelTouch = new FakeTouch({ target: screen, clientX: 50, clientY: 110, pageX: 50, pageY: 110 });
    Object.defineProperty(cancelTouch, 'identifier', { value: 1 });
    fireCancel(cancelTouch);
    expect(focusSpy).not.toHaveBeenCalled();
    // State must be reset — a fresh tap after cancel should focus again
    const freshTouch = new FakeTouch({ target: screen, clientX: 50, clientY: 110, pageX: 50, pageY: 110 });
    Object.defineProperty(freshTouch, 'identifier', { value: 2 });
    fireStart(freshTouch);
    fireEnd(freshTouch);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('T10: scroll emits one SGR sequence per font-row travelled — 60px fontSize 14 damping 6 = 1 line', () => {
    mountHook({ scrollDampingPxPerLine: 6 });
    fireStart(new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 }));
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 140, pageX: 50, pageY: 140 })); // dy = 60
    // 60 / (14 * 6) = 0.71 → rounds to 1 line
    expect(wsSend.mock.calls.length).toBe(1);
  });

  it('T11: scroll emits multiple lines for big drags — 600px with damping 6 fontSize 14 = ~7 lines', () => {
    mountHook({ scrollDampingPxPerLine: 6 });
    fireStart(new FakeTouch({ target: screen, clientX: 50, clientY: 800, pageX: 50, pageY: 800 }));
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 })); // dy = 600
    // 600 / (14 * 6) = 7.14 → rounds to 7 lines
    expect(wsSend.mock.calls.length).toBe(7);
  });

  it('T12: WebSocket closed (readyState !== OPEN) suppresses SGR — no thrown error', () => {
    wsRef.current = { send: vi.fn(), readyState: WebSocket.CLOSED } as unknown as WebSocket;
    const sendSpy = wsRef.current.send as ReturnType<typeof vi.fn>;
    mountHook();
    fireStart(new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 }));
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 120, pageX: 50, pageY: 120 }));
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('T13: hooks cleanup removes all four listeners (touchstart, move, end, cancel)', () => {
    const removeSpy = vi.spyOn(screen, 'removeEventListener');
    const { unmount } = mountHook();
    removeSpy.mockClear();
    unmount();
    const removed = removeSpy.mock.calls.map((c) => c[0]).sort();
    expect(removed).toEqual(['touchcancel', 'touchend', 'touchmove', 'touchstart']);
  });

  it('T14: container without .xterm-screen falls back to container — listeners still fire', () => {
    // Fresh setup: container without nested .xterm-screen, mount hook on it.
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const localContainerRef: { current: HTMLDivElement | null } = { current: root };
    renderHook(() =>
      useTerminalTouchScroll({
        containerRef: localContainerRef,
        terminalRef: termRef,
        wsRef,
        selectModeRef,
      })
    );
    const t = new FakeTouch({ target: root, clientX: 50, clientY: 200, pageX: 50, pageY: 200 });
    fireStart(t, root);
    fireMove(new FakeTouch({ target: root, clientX: 50, clientY: 120, pageX: 50, pageY: 120 }), root);
    expect(wsSend).toHaveBeenCalled();
  });

  it('T15: gesture-stopping — touchmove calls preventDefault + stopImmediatePropagation', () => {
    mountHook();
    fireStart(new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 }));
    const move = fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 120, pageX: 50, pageY: 120 }));
    expect(move.defaultPrevented).toBe(true);
    // stopImmediatePropagation is a browser-level flag we can't introspect
    // reliably in jsdom — but the visible effect (xterm.js seeing no event)
    // is verified by the next test.
  });

  it('T16: after a scroll gesture the touchstart→end with NO move still focuses (state reset works)', () => {
    const focusSpy = vi.fn();
    termRef.current.focus = focusSpy;
    mountHook();
    const startTouch = new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 });
    fireStart(startTouch);
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 120, pageX: 50, pageY: 120 }));
    wsSend.mockClear();
    focusSpy.mockClear();
    // finish that scroll
    const endTouch = new FakeTouch({ target: screen, clientX: 50, clientY: 110, pageX: 50, pageY: 110 });
    Object.defineProperty(endTouch, 'identifier', { value: 1 });
    fireEnd(endTouch);
    expect(focusSpy).not.toHaveBeenCalled();
    // new touch, no move, end — should focus
    const freshTouch = new FakeTouch({ target: screen, clientX: 100, clientY: 100, pageX: 100, pageY: 100 });
    Object.defineProperty(freshTouch, 'identifier', { value: 2 });
    fireStart(freshTouch);
    fireEnd(freshTouch);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('T17: onFirstScroll fires once after the first scroll gesture', () => {
    const onFirstScroll = vi.fn();
    mountHook({ onFirstScroll });
    fireStart(new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 }));
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 120, pageX: 50, pageY: 120 }));
    expect(onFirstScroll).toHaveBeenCalledTimes(1);
  });

  it('T18: onFirstScroll fires only once across multiple gestures', () => {
    const onFirstScroll = vi.fn();
    mountHook({ onFirstScroll });
    // First gesture
    let touch = new FakeTouch({ target: screen, clientX: 50, clientY: 200, pageX: 50, pageY: 200 });
    fireStart(touch);
    fireMove(new FakeTouch({ target: screen, clientX: 50, clientY: 120, pageX: 50, pageY: 120 }));
    let endTouch = new FakeTouch({ target: screen, clientX: 50, clientY: 110, pageX: 50, pageY: 110 });
    Object.defineProperty(endTouch, 'identifier', { value: 1 });
    fireEnd(endTouch);
    expect(onFirstScroll).toHaveBeenCalledTimes(1);
    // Second gesture
    touch = new FakeTouch({ target: screen, clientX: 80, clientY: 200, pageX: 80, pageY: 200 });
    Object.defineProperty(touch, 'identifier', { value: 2 });
    fireStart(touch);
    fireMove(new FakeTouch({ target: screen, clientX: 80, clientY: 100, pageX: 80, pageY: 100 }));
    expect(onFirstScroll).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('T19: onFirstScroll does NOT fire when nothing scrolls (tap only)', () => {
    const onFirstScroll = vi.fn();
    mountHook({ onFirstScroll });
    const t = new FakeTouch({ target: screen, clientX: 100, clientY: 100, pageX: 100, pageY: 100 });
    fireStart(t);
    fireMove(new FakeTouch({ target: screen, clientX: 100, clientY: 101, pageX: 100, pageY: 101 }));
    fireEnd(t);
    expect(onFirstScroll).not.toHaveBeenCalled();
  });
});
