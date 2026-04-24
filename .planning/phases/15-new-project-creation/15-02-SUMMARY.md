---
phase: 15-new-project-creation
plan: "02"
subsystem: frontend-ui
tags: [ui, dialog, optimistic-update, project-creation]
dependency_graph:
  requires: [POST /api/gsd/projects/create (15-01)]
  provides: [NewProjectDialog, api.gsd.create(), "New project" button in GSD header]
  affects: [client/src/lib/api.ts, client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [optimistic-prepend, inline-dialog-no-library, escape-key-handler]
key_files:
  created: []
  modified:
    - client/src/lib/api.ts
    - client/src/pages/GSD.tsx
decisions:
  - name: No external dialog library
    rationale: Fixed overlay with centered modal panel consistent with existing GsdDrawer pattern; avoids new dependency
  - name: Optimistic prepend with minimal GsdProject shape
    rationale: Avoids a full reload; tmuxActive:true ensures tmux controls appear immediately after creation
  - name: showNewProject state in GSD() not extracted to hook
    rationale: Single boolean; extracting would add ceremony without benefit
metrics:
  duration: ~5min
  completed: 2026-04-24
  tasks_completed: 2
  files_modified: 2
---

# Phase 15 Plan 02: NewProjectDialog + api.gsd.create() Summary

**One-liner:** "New project" button in GSD header opens an inline dialog that calls POST /api/gsd/projects/create and optimistically prepends the new card to the grid with tmux controls visible.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add api.gsd.create() to api client | b555699 | client/src/lib/api.ts |
| 2 | NewProjectDialog component + New project button | 2218502 | client/src/pages/GSD.tsx |

## What Was Built

**api.gsd.create()** — new method in the `gsd` namespace of `client/src/lib/api.ts`:
- Calls `POST /api/gsd/projects/create` with `{ name }`
- Returns `{ ok, project: { name, root, tmux_session } }`

**NewProjectDialog** — new component in `client/src/pages/GSD.tsx` (before GSD()):
- Fixed overlay (z-index 60), centered modal panel
- Name input with autoFocus, placeholder "project-name"
- Inline error display (stays open on API error for retry)
- Cancel button and Escape key both close without creating
- Backdrop click closes dialog
- On success: builds minimal GsdProject shape and calls onCreated(), then closes

**GSD() wiring:**
- `showNewProject` state added
- `handleProjectCreated` callback prepends new project to `projects` state
- "+ New project" button added to header (left of Refresh button) — always visible, not conditional on project load
- NewProjectDialog rendered in both desktop (3-column) and mobile layouts

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all state is wired. The optimistic card uses `tmuxActive: true` (correct: session was just created by the backend) and null for planning data (correct: no planning files exist yet for a brand new project).

## Threat Flags

None — no new network endpoints or auth paths introduced on the frontend. The create call goes through the existing `/api/` proxy with the same auth as all other API calls.

## Self-Check

### Files created/modified exist:
- client/src/lib/api.ts — modified (contains `create:` in gsd namespace)
- client/src/pages/GSD.tsx — modified (contains `NewProjectDialog`)

### Commits exist:
- b555699 — feat(15-02): add api.gsd.create() method
- 2218502 — feat(15-02): add NewProjectDialog component and New project button

### Checkpoint status:
Task 3 is a `checkpoint:human-verify` — execution paused awaiting manual verification.

## Self-Check: PASSED
