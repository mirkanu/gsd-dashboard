---
phase: quick-34
plan: "01"
subsystem: client/terminal
tags: [performance, terminal, xterm, code-splitting, ux]
dependency_graph:
  requires: []
  provides: [faster-terminal-mount, xterm-code-split, connecting-placeholder]
  affects: [client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [dynamic-import, async-useEffect-with-cleanup-ref]
key_files:
  modified:
    - client/src/pages/GSD.tsx
decisions:
  - "Used cleanupFn ref pattern to bridge async useEffect IIFE with synchronous React cleanup"
  - "type-only imports preserve TypeScript typing for Terminal and FitAddon refs with zero bundle cost"
metrics:
  duration: "~15min"
  completed: "2026-04-06"
  tasks_completed: 2
  files_modified: 1
---

# Quick Task 34: Terminal Load Delay Fix Summary

Eliminated the 2-3 second terminal startup delay caused by three independent issues in GSD.tsx.

**One-liner:** Removed wsBase blocking guard, added connecting placeholder, and code-split xterm.js via dynamic imports so terminal appears and begins connecting immediately on navigation.

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Fix TerminalPage wsBase blocking + add connecting placeholder | be2b1a3 |
| 2 | Convert xterm static imports to dynamic imports | be2b1a3 |

## What Changed

### Fix 1 — wsBase blocking removed

`TerminalPage.wsBase` state changed from `string | null | undefined` (initial `undefined`) to `string | null` (initial `null`). The `if (wsBase === undefined) return (...)` guard that showed "Connecting..." and blocked `TerminalOverlay` from mounting was removed entirely.

`TerminalOverlay` already falls back to `${proto}//${window.location.host}` when `wsBase === null`, which is the correct relative URL on Railway. The wsBase API fetch still runs in the background and updates the value if the server returns a tunnel URL.

### Fix 2 — Connecting placeholder in TerminalOverlay

Added `connected` state (initially `false`) to `TerminalOverlay`. Set to `true` after `terminal.open()` and `fitAddon.fit()` complete. An `absolute inset-0` overlay with `pointer-events-none` shows "Connecting to terminal..." in the terminal's foreground color against its background — visible during the brief xterm canvas initialization, then hidden.

### Fix 3 — Dynamic xterm imports (code splitting)

Removed static top-level imports:
- `import { Terminal } from "@xterm/xterm"` 
- `import { FitAddon } from "@xterm/addon-fit"`
- `import "@xterm/xterm/css/xterm.css"`

Replaced with `import type` (zero bundle cost) at the top, and dynamic `Promise.all([import(...)])` inside the `useEffect` async IIFE. The xterm modules are now separate chunks, not loaded until the terminal component mounts.

Build output confirms the split:
- `dist/assets/xterm-Brq1XyzA.js` (335KB, lazy)
- `dist/assets/addon-fit-B680WlWd.js` (1.77KB, lazy)
- `dist/assets/xterm-Dy9PbxO4.css` (6.47KB, lazy)

### Implementation pattern

The `useEffect` async IIFE uses a `cleanupFn` ref populated by the async body. The synchronous cleanup return sets `cancelled = true` and calls `cleanupFn?.()`. This bridges React's synchronous cleanup requirement with the async setup.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `client/src/pages/GSD.tsx` modified
- [x] No `wsBase === undefined` guard in TerminalPage
- [x] `connected` state with placeholder in TerminalOverlay
- [x] No static xterm imports at top of file
- [x] Dynamic imports inside useEffect async IIFE
- [x] Build succeeds with separate xterm chunks
- [x] Client tests: same result as baseline (2 pre-existing Sidebar failures, 115 pass)
- [x] Commit be2b1a3 exists

## Self-Check: PASSED
