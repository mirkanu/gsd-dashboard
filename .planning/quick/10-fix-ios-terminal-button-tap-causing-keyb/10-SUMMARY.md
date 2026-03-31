---
phase: quick-10
plan: 10
subsystem: client/terminal
tags: [ios, mobile, ux, terminal, keyboard]
dependency_graph:
  requires: []
  provides: [specialKeyPressRef-guard]
  affects: [client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [boolean-ref-guard, focus-retention]
key_files:
  created: []
  modified:
    - client/src/pages/GSD.tsx
decisions:
  - "Use specialKeyPressRef (boolean ref) rather than state to avoid re-render overhead and stale closure issues in the blur handler"
  - "Set ref true on touchstart (before send()) and false on touchend to bracket the tap window precisely"
  - "Call terminal.focus() immediately in handleXtermBlur when ref is true to refocus synchronously before iOS can hide the keyboard"
metrics:
  duration: 202s
  completed: "2026-03-31T15:09:13Z"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 10: Fix iOS Terminal Button Tap Causing Keyboard Flicker — Summary

One-liner: Boolean ref guard in handleXtermBlur prevents iOS keyboard flicker when tapping SpecialKeyBar buttons.

## What Was Built

Added a `specialKeyPressRef` boolean ref to `TerminalOverlay` that SpecialKeyBar sets to `true` on `touchstart` and `false` on `touchend`. The `handleXtermBlur` handler checks this ref — if set, it immediately calls `terminal.focus()` and returns early, preventing `setTerminalFocused(false)` from being called. This stops the keyboard flicker and SendBox flash that occurred on every SpecialKeyBar tap on iOS.

## Root Cause

On iOS, tapping a button outside the xterm textarea triggers a native `blur` event on the hidden `.xterm-helper-textarea`, firing `handleXtermBlur` which set `terminalFocused=false`. This caused `SendBox` to appear and the keyboard to hide. Then `terminal.focus()` inside `send()` refocused the terminal, reversing the state. The net effect was a keyboard toggle flicker and layout shift on every special key tap.

## Tasks Completed

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Add specialKeyPressRef guard to suppress iOS blur flicker | baeddc7 | client/src/pages/GSD.tsx |

## Decisions Made

- **specialKeyPressRef as boolean ref** — using a ref (not state) avoids re-render overhead and stale closure issues inside the blur event handler, which is registered in the main useEffect
- **Set true on touchstart, false on touchend** — brackets the precise tap window; the blur fires during this window, so the guard is always set when needed
- **Immediate terminal.focus() in blur guard** — synchronously refocuses the terminal before iOS can process the focus change, preventing the keyboard from collapsing

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] `specialKeyPressRef` declared in `TerminalOverlay` (line 217)
- [x] `SpecialKeyBar` signature updated with `specialKeyPressRef` prop (lines 161-168)
- [x] `onTouchStart` sets `specialKeyPressRef.current = true` before `send()` (line 183)
- [x] `onTouchEnd` sets `specialKeyPressRef.current = false` (line 184)
- [x] `handleXtermBlur` returns early with `terminal.focus()` when ref is true (lines 371-378)
- [x] `specialKeyPressRef` passed to `SpecialKeyBar` in JSX (line 509)
- [x] Client test suite: 106 passing, 2 pre-existing failures in Sidebar.test.tsx (unrelated to this change, confirmed pre-existing on baseline)
- [x] Commit baeddc7 exists
