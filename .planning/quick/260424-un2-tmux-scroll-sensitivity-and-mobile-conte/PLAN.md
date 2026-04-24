---
title: Fix tmux scroll sensitivity, scroll repeat bug, and mobile context bar
slug: un2-tmux-scroll-sensitivity-and-mobile-conte
date: 2026-04-24
---

# Three tmux terminal fixes

## Issue 1: Scroll too sensitive
`attachCustomWheelEventHandler` divides deltaY by fontSize (14), sending ~7 SGR sequences per wheel notch (deltaY=100). Fix: divide by `fontSize * 3` (~2-3 lines per notch).

## Issue 2: Scroll repeats every ~1.5 pages
xterm.js defaults to 1000-line scrollback buffer. When user scrolls up via SGR sequences to tmux, xterm.js's internal buffer also accumulates content. When tmux scrollback reaches a boundary, xterm.js resets its viewport to its own buffer tail, causing repeated content. Fix: set `scrollback: 0` in Terminal constructor.

## Issue 3: Claude context bar hidden on mobile
`ContextBar` is commented out in `SendBox` with a TODO. The `contextTokens` prop is passed as `null` everywhere. Fix:
- Add `contextTokens?: number | null` prop to `TerminalOverlayProps`
- Re-enable `ContextBar` in `SendBox` (conditionally when tokens > 0)
- Pass URL query param `?tokens=N` when opening `/terminal/:name` on mobile
- Read that param in `TerminalPage` and pass to `TerminalOverlay`
- Pass from `selectedProj.contextTokens` for inline desktop terminal

## Files to change
- `client/src/pages/GSD.tsx`
