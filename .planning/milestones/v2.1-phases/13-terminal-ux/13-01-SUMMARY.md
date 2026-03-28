---
phase: 13-terminal-ux
plan: 01
subsystem: client-ui
tags: [terminal, sendbox, ux, refactor]
dependency_graph:
  requires: []
  provides: [TerminalOverlay with embedded SendBox]
  affects: [client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [prop-threading, controlled-state-reset]
key_files:
  modified:
    - client/src/pages/GSD.tsx
decisions:
  - "contextTokens passed as null into overlay SendBox — avoids threading token data; ContextBar already commented out in SendBox"
  - "terminalInitialValue reset to empty string on overlay close to avoid stale pre-population on next open"
metrics:
  duration: ~5m
  completed: 2026-03-26
  tasks_completed: 2
  files_changed: 1
---

# Phase 13 Plan 01: Move SendBox into TerminalOverlay Summary

SendBox relocated from ProjectCard into TerminalOverlay with state?.next_action pre-population on open.

## What was done

**Task 1 — TerminalOverlay gains SendBox:**
- Added `initialSendValue: string` prop to `TerminalOverlayProps` interface and function signature.
- Rendered `<SendBox>` in a `flex-shrink-0` div below the xterm container div, so the terminal fills remaining height and the input is pinned at the bottom.
- Added `terminal.focus()` call immediately after `fitAddon.fit()` so the terminal captures keystrokes on desktop without requiring a user click.

**Task 2 — ProjectCard cleanup and GSD page wiring:**
- Changed `onOpenTerminal` prop type from `() => void` to `(initialValue: string) => void`.
- Updated the "Open terminal" button's onClick to pass `state?.next_action ?? ""` as the initial value.
- Removed the `{project.tmuxActive && <SendBox ... />}` block from ProjectCard entirely.
- Added `terminalInitialValue` state alongside the existing terminal state in the GSD page.
- Updated both `onOpenTerminal` call sites (active grid and archived grid) to set both `terminalProject` and `terminalInitialValue`.
- Passed `initialSendValue={terminalInitialValue}` into `<TerminalOverlay>`.
- Reset `terminalInitialValue` to `""` in the `onClose` handler to prevent stale values on subsequent opens.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript: `npx tsc --noEmit` produces no errors in source files (pre-existing csstype node_modules parse error unaffected by this change).
- Client test runner had a pre-existing startup failure (`magic-string` ESM export issue in vitest/mocker) unrelated to this change.
- All edits are confined to `client/src/pages/GSD.tsx`.

## Self-Check: PASSED

- Commit `1721d29` exists and contains all changes.
- `client/src/pages/GSD.tsx` modified as specified.
- No source-level TypeScript errors introduced.
