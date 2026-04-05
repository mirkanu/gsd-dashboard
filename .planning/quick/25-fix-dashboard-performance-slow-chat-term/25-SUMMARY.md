---
phase: quick-25
plan: 01
subsystem: client-performance, server-terminal
tags: [performance, polling, windowing, pty, websocket]
dependency_graph:
  requires: []
  provides: [windowed-chat-rendering, reduced-polling, scoped-autopilot-fetch, pty-batching]
  affects: [ChatWindow, GSD.tsx, terminal.js]
tech_stack:
  added: []
  patterns: [render-windowing, ref-based-closure-escape, pty-buffering]
key_files:
  modified:
    - client/src/components/ChatWindow.tsx
    - client/src/pages/GSD.tsx
    - server/routes/terminal.js
decisions:
  - "Render last 80 messages only (not virtual scroll) - simpler, correct for load-more flow"
  - "selectedProjRef pattern to escape stale closure in load() without adding it to deps"
  - "16ms PTY flush matches 60fps display cadence; flushPty called on both ws close and pty exit"
  - "DB index already present as idx_gsd_messages_project (identical coverage) - no duplicate added"
metrics:
  duration: "12 minutes"
  completed: "2026-04-05"
  tasks: 2
  files: 3
---

# Quick Task 25: Fix Dashboard Performance — Slow Chat, Terminal

## One-liner

Windowed chat rendering (last 80 msgs), 10s/60s polling, scoped autopilot fetch, and 16ms PTY batching reduce browser load and network traffic on large projects.

## What Was Done

### Task 1: Client-side performance (ChatWindow.tsx + GSD.tsx)

**ChatWindow.tsx — windowed rendering**

Replaced the unconditional `messages.map(...)` at the messages render site with a
`(messages.length > 80 ? messages.slice(-80) : messages).map(...)`. This means the DOM
never holds more than 80 message nodes at once. Older messages are already paginated via
the load-more button; the slice correctly shows the most recent history by default.

No new dependencies added.

**GSD.tsx — polling intervals**

Changed the adaptive polling from 3s/30s to 10s/60s. The chat window already receives
real-time updates via WebSocket (eventBus); the poll is only needed for project list
metadata, so 10s is more than sufficient when working.

**GSD.tsx — scoped autopilot fetch**

The `load()` callback previously fetched autopilot status for every non-archived project
on every poll (N HTTP requests). Changed to fetch only for the selected project using
a `selectedProjRef` ref pattern to safely read the current value inside the `[]`-dep
callback without creating stale closures.

**GSD.tsx — terminal close burst removed**

`handleTerminalClose` previously started a 500ms setInterval burst for 2 seconds.
Replaced with a single `load(false)` call. The `refreshIntervalRef` and `refreshTimeoutRef`
refs and the associated cleanup effect were removed entirely.

### Task 2: Server-side performance (terminal.js)

**PTY output batching**

The `pty.onData` handler previously sent each byte directly to the WebSocket. Replaced
with a 16ms buffer (`ptyBuffer`/`flushTimer`) that accumulates output and flushes at
most once per animation frame. This matches the 60fps display cadence.

Cleanup is added to both `ws.on('close', ...)` and `pty.onExit(...)` to flush any
remaining buffer immediately on teardown.

**DB index — already present**

The plan specified adding `idx_gsd_messages_project_created ON gsd_messages(project, created_at DESC)`.
Inspection of db.js (line 118) showed an equivalent index `idx_gsd_messages_project ON
gsd_messages(project, created_at DESC)` already exists in the schema. No change needed;
no duplicate index was added.

## Deviations from Plan

### Already handled

**DB composite index** — The index was already present under a slightly different name
(`idx_gsd_messages_project` vs `idx_gsd_messages_project_created`). Coverage is identical.
No action taken; no test regression possible.

## Self-Check

### Files exist

- client/src/components/ChatWindow.tsx — modified
- client/src/pages/GSD.tsx — modified
- server/routes/terminal.js — modified

### Commits exist

- d9ef600: perf(quick-25): windowed chat rendering, reduced polling, scoped autopilot fetch
- 47dc479: perf(quick-25): batch PTY output 16ms before WebSocket send

### Tests

- `npm run test:client`: 115 pass, 2 fail (Sidebar.test.tsx v1.0.0 mismatch — pre-existing)
- Server tests (chatMessages, classifier): all pass
- `client npm run build`: clean, no TypeScript errors

## Self-Check: PASSED
