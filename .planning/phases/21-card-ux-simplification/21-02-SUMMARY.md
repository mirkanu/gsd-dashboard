---
phase: 21-card-ux-simplification
plan: "02"
subsystem: client-ui
tags: [card-ux, simplification, ProjectCard, react]
dependency_graph:
  requires: []
  provides: [slim-project-card]
  affects: [client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [component-trimming, dead-code-removal]
key_files:
  created: []
  modified:
    - client/src/pages/GSD.tsx
decisions:
  - "Keep current_phase and milestone_name one-liners in header (acceptable minimal context per plan spec)"
  - "Pre-existing GSD_CHIPS and ContextBar unused consts left as-is (out-of-scope, pre-existing)"
  - "Pre-existing Sidebar test failures confirmed pre-existing, not caused by this plan"
metrics:
  duration: "5 minutes"
  completed: "2026-03-30"
  tasks_completed: 2
  files_modified: 1
---

# Phase 21 Plan 02: Slim ProjectCard — Remove Body Sections Summary

**One-liner:** Stripped ProjectCard down to header + terminal + archive by removing progress bar, stats, last activity, next action, blockers list, and expandable roadmap panel, plus all now-unused helper components and lucide imports.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Slim down ProjectCard — remove body sections, keep header + terminal + archive | 8a35c1a | client/src/pages/GSD.tsx |
| 2 | Verify GsdProject.test.ts — confirm no regressions from card slimming | (no changes needed) | — |

## What Was Built

- `ProjectCard` now renders only: project name, version badge, session state label, Blocked badge (header), StatusBadge, current_phase one-liner, milestone_name one-liner, liveUrl link, Open Terminal / Re-open button, Archive / Unarchive button.
- Removed from card: progress section (ProgressBar, phase summary, requirements %), last activity text, next action text, blockers list with AlertCircle icons, stats row (velocity/streak/estimatedCompletion), expandable roadmap panel with RoadmapPanel and PhaseIcon sub-components.
- Removed helper components: `PhaseIcon`, `ProgressBar`, `RoadmapPanel` (all three only served removed sections).
- Removed lucide imports: `CheckCircle2`, `Circle`, `Clock`, `AlertCircle`, `ChevronDown`, `ChevronRight`, `Layers`, `ClipboardList`.
- Removed type import: `GsdPhase` (only used by RoadmapPanel).
- Simplified ProjectCard destructuring: `const { state, roadmap, requirements } = project` → `const { state } = project`.
- Removed internal variables: `progress`, `phaseSummary`, `expanded`/`setExpanded` state.

## Verification

- `npm run build`: passes cleanly (no TypeScript errors)
- `npm run test:client`: 106/108 tests pass; 2 Sidebar failures confirmed pre-existing before this plan

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `client/src/pages/GSD.tsx` exists and modified — FOUND
- [x] Commit `8a35c1a` exists — FOUND
- [x] Build passes — VERIFIED
- [x] Tests: pre-existing failures confirmed not introduced by this plan

## Self-Check: PASSED
