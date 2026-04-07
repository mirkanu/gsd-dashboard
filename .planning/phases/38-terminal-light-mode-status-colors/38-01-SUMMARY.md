---
phase: 38-terminal-light-mode-status-colors
plan: "01"
subsystem: client-ui
tags: [light-mode, terminal, xterm, status-badges, accessibility]
dependency_graph:
  requires: []
  provides: [terminal-light-mode-selection, terminal-header-button-visibility, status-badge-colors]
  affects: [GSD.tsx, ProjectMetadata.tsx, ProjectDetailsPanel.tsx, ChatListView.tsx]
tech_stack:
  added: []
  patterns: [xterm-theme-config, tailwind-color-tokens]
key_files:
  created: []
  modified:
    - client/src/pages/GSD.tsx
    - client/src/components/ProjectMetadata.tsx
    - client/src/components/ProjectDetailsPanel.tsx
    - client/src/components/ChatListView.tsx
decisions:
  - "Used rgba(99,102,241) indigo for selectionBackground to match existing ::selection override in index.css"
  - "Replaced hover:text-white with hover:text-gray-900 (dark text on hover) — works correctly in both light and dark mode"
  - "waiting=blue-500, paused=orange-500 per UX-03 product spec"
metrics:
  duration: "3m 31s"
  completed: "2026-04-07"
  tasks_completed: 2
  files_modified: 4
requirements_completed: [TERM-03, TERM-04, UX-03]
---

# Phase 38 Plan 01: Terminal Light Mode & Status Colors Summary

xterm light mode selectionBackground fix plus terminal header button visibility fix and waiting/paused badge color corrections to blue and orange.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix xterm light mode — selectionBackground + header button hover colors | b08241c | client/src/pages/GSD.tsx |
| 2 | Fix status badge colors in component files (UX-03) | cfcc37d | ProjectMetadata.tsx, ProjectDetailsPanel.tsx, ChatListView.tsx |

## What Was Built

**TERM-03 — xterm selection visibility in light mode:**
Added `selectionBackground: 'rgba(99, 102, 241, 0.35)'` to `TERM_THEMES.light` and `'rgba(99, 102, 241, 0.4)'` to `TERM_THEMES.dark` for parity. Updated the `Terminal` constructor to pass `selectionBackground` from the theme object. Previously, text selection in light mode was invisible (indigo selection on white background produced no contrast).

**TERM-04 — Terminal header button hover visibility:**
Replaced all 4 occurrences of `hover:text-white` in the terminal overlay header with `hover:text-gray-900`. In light mode, white text on a near-white background (#f5f5f5) was completely invisible. Dark text on hover works correctly in both light and dark modes.

**UX-03 — Status badge color corrections (all views):**
Updated `waiting` from amber to blue and `paused` from red to orange across:
- `SESSION_STATE_CONFIG` in GSD.tsx (ProjectCard borders + labels)
- `SESSION_STATE_STYLE` in ProjectMetadata.tsx (badge chips)
- `SESSION_STATE_STYLE` in ProjectDetailsPanel.tsx (badge chips)
- `STATE_BORDER` in ChatListView.tsx (left border stripes)

## Decisions Made

- Indigo (`rgba(99, 102, 241, ...)`) chosen for `selectionBackground` to match the existing `::selection` CSS override in `index.css` — consistent selection highlight color across native and xterm content.
- `hover:text-gray-900` chosen over `dark:hover:text-white` to keep a single class per element — `gray-900` is legible on both light surfaces and dark `bg-surface-3` hover backgrounds.
- blue-500 / orange-500 Tailwind tokens match the product spec in UX-03 and complement the existing emerald-500 (working) and gray-600 (archived) tokens.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `selectionBackground` present in TERM_THEMES.light and TERM_THEMES.dark in GSD.tsx
- [x] Terminal constructor passes `selectionBackground`
- [x] No `hover:text-white` in terminal header (replaced with `hover:text-gray-900`)
- [x] `waiting: "bg-blue-500/20 text-blue-400"` in ProjectMetadata.tsx and ProjectDetailsPanel.tsx
- [x] `waiting: "border-l-blue-500"` in ChatListView.tsx
- [x] Build passes: `✓ built in 7.53s`
- [x] Commits b08241c and cfcc37d present

## Self-Check: PASSED
