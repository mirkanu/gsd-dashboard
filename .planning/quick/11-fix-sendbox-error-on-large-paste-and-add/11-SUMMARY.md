---
phase: quick-11
plan: "01"
subsystem: terminal-ux
tags: [mobile, terminal, paste, tmux, large-text]
dependency_graph:
  requires: []
  provides: [paste-button-mobile, large-paste-fix]
  affects: [client/src/pages/GSD.tsx, server/routes/gsd.js]
tech_stack:
  added: []
  patterns: [navigator.clipboard.readText, spawnSync-stdin, tmux-load-buffer]
key_files:
  created: []
  modified:
    - client/src/pages/GSD.tsx
    - server/routes/gsd.js
decisions:
  - "Paste button sends directly to pty WebSocket (no HTTP round-trip), bypassing arg-length limits entirely on the client path"
  - "Server load-buffer threshold set at 1000 chars to match plan spec; short text continues via send-keys for minimal latency"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-31"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 11: Fix SendBox Error on Large Paste and Add Mobile Paste Button

**One-liner:** Mobile Paste button sends clipboard text directly to pty via WebSocket; server send endpoint uses tmux load-buffer + paste-buffer for text over 1000 chars to avoid arg length limits.

## What Was Built

### Task 1 — Paste button in TerminalOverlay header (mobile only)

Added a `Paste` button to the terminal header bar that:
- Only appears on mobile (`isMobile` check using `window.matchMedia('(pointer: coarse)').matches`)
- Reads clipboard via `navigator.clipboard.readText()`
- Sends the text directly to the pty via `wsRef.current.send(text)` (no HTTP round-trip)
- Shows `Pasted!` label for 1.5 seconds, then reverts to `Paste`
- Is positioned between the project name and the Select button (order: [Paste] [Select] [X])

Added `ClipboardPaste` import from lucide-react (import unused visually — button uses text label only).

**Files modified:**
- `client/src/pages/GSD.tsx` — `ClipboardPaste` import, `pasteLabel` state, `handlePaste` handler, button JSX

### Task 2 — Server send endpoint robust for large text

In `POST /api/gsd/projects/:name/send`, replaced the single `execFileSync` send-keys call with conditional logic:

- **Text > 1000 chars:** `spawnSync('tmux', ['load-buffer', '-'], { input: text })` feeds text via stdin (no arg-length limit), then `spawnSync('tmux', ['paste-buffer', '-t', session])` pastes it, then `execFileSync` sends Enter.
- **Text <= 1000 chars:** unchanged — `execFileSync('tmux', ['send-keys', ...])` as before.

Response shape unchanged: `{ ok: true }` on success. `insertGsdMessage` call preserved.

**Files modified:**
- `server/routes/gsd.js` — send handler updated with `spawnSync` branch for large text

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run test:client`: 106/108 tests pass. 2 failures in `Sidebar.test.tsx` are pre-existing (confirmed by checking baseline before changes).
- `npm run test:server`: Known pre-existing failures in `readProjectMeta`/`resolveFile`/`GET files/:fileId` — confirmed pre-existing by stash baseline check. No regressions introduced.
- `npm run build`: exits 0. 1863 modules transformed successfully.

## Self-Check

### Files exist

- `client/src/pages/GSD.tsx` — contains `pasteLabel`, `handlePaste`, Paste button JSX
- `server/routes/gsd.js` — contains `spawnSync`, `load-buffer` branch

### Commits exist

- `5b92b18` — feat(quick-11): add Paste button to terminal header (mobile only)
- `48283da` — fix(quick-11): use tmux load-buffer + paste-buffer for large text in send endpoint

## Self-Check: PASSED
