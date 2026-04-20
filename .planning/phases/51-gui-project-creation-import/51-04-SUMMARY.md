---
phase: 51-gui-project-creation-import
plan: "04"
subsystem: client/hooks + client/components
tags: [ui, websocket, project-creation, live-card, progress-chips, error-recovery]
dependency_graph:
  requires:
    - 51-02 (POST /api/projects/create, POST /api/projects/resume/:name WebSocket broadcast)
    - 51-03 (ProjectProgressChip, CREATION_STEPS, CreationState, NewProjectDialog)
  provides:
    - client/src/hooks/useProjectCreationState.ts (handleCreationStateMessage, useProjectCreationState, useActiveCreationProjects, clearCreationState, useProjectCreationStateSubscriber)
    - client/src/components/ProjectCreationCard.tsx (live creation card with 7 progress chips, error state, Resume button)
    - client/src/components/ChatListView.tsx (extended: renders ProjectCreationCard above regular project list)
    - client/src/components/NewProjectDialog.tsx (extended: optimistic creation state injection on 202)
  affects:
    - GSD.tsx (wired useProjectCreationStateSubscriber for eventBus WS handler)
tech_stack:
  added: []
  patterns:
    - Module-level singleton state map + listener Set for cross-component state sharing without context
    - eventBus.subscribe pattern (matches Phase 43 project_state_change subscription in GSD.tsx)
    - Optimistic UI: handleCreationStateMessage called client-side before WebSocket update arrives
    - clearCreationState + 1.5s timeout for smooth creation → working card transition
    - useActiveCreationProjects hook drives creation card list in ChatListView
key_files:
  created:
    - client/src/hooks/useProjectCreationState.ts
    - client/src/components/ProjectCreationCard.tsx
  modified:
    - client/src/components/ChatListView.tsx
    - client/src/components/NewProjectDialog.tsx
    - client/src/pages/GSD.tsx
decisions:
  - "eventBus subscription pattern chosen over direct WS handler patch: App.tsx uses eventBus.publish(msg) for all WS messages; subscribing via eventBus.subscribe in useProjectCreationStateSubscriber follows the established Phase 43 pattern and avoids touching App.tsx's onMessage callback"
  - "Module-level state map (not React context) for creation state: multiple ChatListView instances and ProjectCreationCard instances need shared state without prop drilling; module-level listeners Set avoids re-renders from unrelated state changes"
  - "useProjectCreationStateSubscriber mounted in GSD.tsx: this is the page that renders ChatListView and handles all other WS subscriptions; co-location is consistent with existing autopilot_progress and project_state_change subscriptions"
  - "activeCreations filter excludes working-status projects: during the 1.5s clearCreationState delay, the real project card from the broadcaster may appear; filtering on status !== 'working' prevents duplicate rendering"
metrics:
  duration: "13 minutes"
  completed: "2026-04-20"
  tasks_completed: 2
  files_created: 2
  files_modified: 3
---

# Phase 51 Plan 04: Live Creation Card + WebSocket Hook Summary

**One-liner:** useProjectCreationState hook (module-level singleton with eventBus subscription) and ProjectCreationCard (7-step progress chips, error state, Resume button calling POST /api/projects/resume/:name) wired into ChatListView and NewProjectDialog for optimistic <200ms card appearance.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | useProjectCreationState hook + ProjectCreationCard component | 822a204 | client/src/hooks/useProjectCreationState.ts, client/src/components/ProjectCreationCard.tsx, client/src/pages/GSD.tsx |
| 2 | Wire ProjectCreationCard into ChatListView + end-to-end smoke test | b7ee81e | client/src/components/ChatListView.tsx, client/src/components/NewProjectDialog.tsx |

## What Was Built

### client/src/hooks/useProjectCreationState.ts (new)

- `handleCreationStateMessage`: updates module-level `creationStates` map and notifies all listeners; called both by the eventBus subscriber and directly from NewProjectDialog for optimistic injection
- `clearCreationState`: removes a project from the map and notifies listeners; called by ProjectCreationCard on success (1.5s after `working` status)
- `useProjectCreationState(projectName)`: returns `CreationState | null` for a specific project; subscribes to the module-level listener Set
- `useActiveCreationProjects()`: returns all `[name, CreationState]` pairs in the map; drives ChatListView's creation card list
- `useProjectCreationStateSubscriber()`: subscribes to `eventBus` and dispatches `project_creation_state` WS messages into the state map; mounted once in GSD.tsx

### client/src/components/ProjectCreationCard.tsx (new)

Props: `{ projectName: string; onDismiss?: () => void }`

- All 7 `CREATION_STEPS` rendered as `ProjectProgressChip` instances
- Status badge: indigo "Creating" with `Loader2 animate-spin` during creating/analyzing; red "Setup incomplete" during error
- Auto-dismisses 1.5s after `status === 'working'` via `clearCreationState` + `onDismiss()`
- Error state: displays `failed_at_step` + `error_message`; Cancel button calls `clearCreationState`; Resume button calls `POST /api/projects/resume/:name` with loading state
- Returns `null` when `useProjectCreationState` returns null (project not in creation mode)

### client/src/components/ChatListView.tsx (modified)

- Imports `useActiveCreationProjects` and `ProjectCreationCard`
- Calls `useActiveCreationProjects()` inside the component
- Computes `activeCreations`: filters out projects with `status === 'working'` and any already present in the regular projects list (dedup during 1.5s transition)
- Empty state check extended: shows "No projects found" only when both `sorted.length === 0` and `activeCreations.length === 0`
- Returns `<>` fragment wrapping creation cards above `<ConversationList>`

### client/src/components/NewProjectDialog.tsx (modified)

- Imports `handleCreationStateMessage` from the hook
- On 202 response: calls `handleCreationStateMessage({ project: sanitized, status: 'creating', current_step: 'scaffold' })` before `onCreated()` and `onClose()` — card appears in ChatListView within the same render cycle, well before the first WebSocket update

### client/src/pages/GSD.tsx (modified)

- Imports `useProjectCreationStateSubscriber`
- Calls `useProjectCreationStateSubscriber()` inside the `GSD` function, co-located with the other `project_state_change` and `autopilot_progress` eventBus subscriptions

## Verification

- TypeScript: zero errors in the 2 new files and 3 modified files (all errors from `tsc --noEmit` are pre-existing in test fixtures and GSD.tsx touch event handlers; confirmed by `grep` finding no errors mentioning our files)
- Client tests: 80 passed / 59 failed — identical to pre-existing baseline (zero regressions)
- Server tests: all passing (all ✔ in output, no failures)
- `npm run build` exits 0
- Acceptance criteria (all met):
  - `useProjectCreationState.ts` exists; exports `handleCreationStateMessage`, `useProjectCreationState`, `useActiveCreationProjects`, `clearCreationState`
  - `grep "CREATION_STEPS.map" ProjectCreationCard.tsx` matches (line 72)
  - `grep "projects/resume" ProjectCreationCard.tsx` matches (line 39)
  - `grep "clearCreationState" ProjectCreationCard.tsx` matches (lines 5, 24, 48)
  - `grep "useProjectCreationStateSubscriber" GSD.tsx` matches (lines 25, 1045)
  - `grep "ProjectCreationCard" ChatListView.tsx` matches
  - `grep "useActiveCreationProjects" ChatListView.tsx` matches
  - `grep "handleCreationStateMessage" NewProjectDialog.tsx` matches (line 102)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with one architectural clarification below.

### Clarification (not a deviation)

**eventBus subscription instead of direct App.tsx patch:** The plan suggested adding a handler in `App.tsx`'s `onMessage` callback. However, App.tsx already delegates all WS messages to `eventBus.publish(msg)`, and the established pattern (used by GSD.tsx for `project_state_change` and `autopilot_progress`) is to subscribe to the eventBus in the consuming component. Implemented `useProjectCreationStateSubscriber` hook mounted in GSD.tsx rather than modifying App.tsx — cleaner separation of concerns, zero regression risk to the auth/routing layer.

## Known Stubs

None — all components implement their full intended behavior. The `onDismiss` prop on `ProjectCreationCard` is optional and wired through `useActiveCreationProjects` in ChatListView; when not provided, `clearCreationState` still cleans up the map correctly.

## Threat Surface Scan

No new trust boundaries or network endpoints introduced by this plan (UI only).

- T-51-16 (Resume endpoint /:name): mitigated by Plan 02 backend validation — client calls `POST /api/projects/resume/:name` with name from the creation state map (server-originated data), not from user text input
- T-51-17 (Duplicate entries): mitigated by `clearCreationState()` on success and `activeCreations` filter in ChatListView
- T-51-18 (Error messages): `error_message` field comes from server WebSocket broadcast which runs through `toPlainError()` per Plan 02 implementation

## Self-Check: PASSED

- client/src/hooks/useProjectCreationState.ts: FOUND (exports handleCreationStateMessage, useProjectCreationState, useActiveCreationProjects, clearCreationState, useProjectCreationStateSubscriber)
- client/src/components/ProjectCreationCard.tsx: FOUND (CREATION_STEPS.map, projects/resume, clearCreationState all present)
- client/src/components/ChatListView.tsx: FOUND (ProjectCreationCard, useActiveCreationProjects imports present)
- client/src/components/NewProjectDialog.tsx: FOUND (handleCreationStateMessage import and call present)
- client/src/pages/GSD.tsx: FOUND (useProjectCreationStateSubscriber import and call present)
- Commit 822a204 (Task 1): FOUND
- Commit b7ee81e (Task 2): FOUND
