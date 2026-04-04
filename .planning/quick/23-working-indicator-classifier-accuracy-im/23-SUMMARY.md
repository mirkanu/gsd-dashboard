---
phase: quick-23
plan: 1
subsystem: classifier, chat-ui
tags: [classifier, working-indicator, tmux, chat-ux]
dependency_graph:
  requires: []
  provides: [expanded-hidden-patterns, extractStatusLine, bottom-working-indicator]
  affects: [classifierPatterns, tmux, gsd-routes, ChatWindow, WorkingIndicator, GsdProject-type]
tech_stack:
  added: []
  patterns: [bottom-positioned-typing-indicator, live-tmux-status-extraction]
key_files:
  created: []
  modified:
    - server/gsd/classifierPatterns.js
    - server/__tests__/fixtures/tmux-samples.js
    - server/__tests__/classifier.test.js
    - server/gsd/tmux.js
    - server/routes/gsd.js
    - client/src/lib/types.ts
    - client/src/components/WorkingIndicator.tsx
    - client/src/components/ChatWindow.tsx
    - client/src/pages/GSD.tsx
    - client/src/pages/__tests__/GSD.filter.test.ts
decisions:
  - Status text displayed as-is from tmux (already contains timing info)
  - WorkingIndicator uses border-t instead of border-b for bottom positioning
metrics:
  duration: 15min
  completed: 2026-04-04
---

# Quick Task 23: Working Indicator + Classifier Accuracy Improvements

Expanded classifier hidden patterns to catch tool output noise (bullet tool calls, continuation lines, collapsed markers, status indicators, user prompt echo, JSON blocks) and moved the working indicator from top of chat to bottom typing-indicator position with live tmux status text.

## Task Results

### Task 1: Expand classifier hidden patterns + extract status line from tmux
- **Commit:** d2639d1
- **TDD:** RED-GREEN cycle verified (test failed first, then passed)
- Added 6 new hidden pattern groups to classifierPatterns.js
- Added 11 fixture samples in hiddenToolOutputSamples array
- Created extractStatusLine function in tmux.js (scans bottom-up for status symbols)
- Added statusText field to projects API response (only when working)
- All 36 server tests pass

### Task 2: Move working indicator to bottom of chat + thread statusText prop
- **Commit:** 01088c2
- Added statusText to GsdProject TypeScript interface
- WorkingIndicator now accepts statusText prop, shows it when available, falls back to elapsed timer
- Moved WorkingIndicator from between header/messages to between messages/command-chips
- Both desktop (3-column) and mobile ChatWindow usages pass statusText
- Fixed test fixture to include new fields
- Vite build succeeds

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed test fixture missing new type fields**
- **Found during:** Task 2
- **Issue:** GSD.filter.test.ts makeProject helper was missing display_name, lastMessage, and statusText fields after adding statusText to GsdProject interface
- **Fix:** Added the three missing fields to the test fixture
- **Files modified:** client/src/pages/__tests__/GSD.filter.test.ts
- **Commit:** 01088c2

## Verification

- Server tests: 36/36 pass (classifier + tmux tests)
- Client build: Vite production build succeeds
- New patterns correctly classify all tool output as hidden
- Working indicator renders at bottom of chat above send box
