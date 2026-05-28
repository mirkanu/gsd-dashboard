---
phase: 58-project-maturity-stages
plan: "03"
subsystem: client-types
tags: [types, api-client, typescript, project-maturity]
dependency_graph:
  requires: [58-01]
  provides: [ProjectStage type, GsdProject.stage, api.gsd.stageTransition, api.gsd.validateStageTransition]
  affects: [client/src/lib/types.ts, client/src/lib/api.ts]
tech_stack:
  added: []
  patterns: [TypeScript type extension, api client method pattern (request<T>)]
key_files:
  created: []
  modified:
    - client/src/lib/types.ts
    - client/src/lib/api.ts
decisions:
  - "ProjectStage, GateResult, StageValidationResult added to types.ts as new exports alongside existing SessionState"
  - "GsdProject.stage fields all optional — backward compatible with older projects that have no stage set"
  - "stageTransition and validateStageTransition follow existing api.gsd method pattern (request<T> + encodeURIComponent)"
  - "GsdProject imported into api.ts from types — was previously inlined as import('./types').GsdProject in projects method"
metrics:
  duration: 8min
  completed: "2026-05-28T11:59:35Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 58 Plan 03: TypeScript Types and API Client Contracts Summary

TypeScript type contracts and API client methods for the project maturity stages feature — ProjectStage union type, gate validation interfaces, GsdProject stage fields, and two new api.gsd methods.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend types.ts with ProjectStage, GateResult, GsdProject.stage | 11870c8 | client/src/lib/types.ts |
| 2 | Add stageTransition and validateStageTransition to api.ts | 7bb38e1 | client/src/lib/api.ts |

## Changes Made

### client/src/lib/types.ts

After `SessionState` (line 74), added:
- `ProjectStage` type union: `"draft" | "alpha" | "beta" | "launched" | "maintenance" | "retired"`
- `GateResult` interface: `{ gate: string; label: string; pass: boolean }`
- `StageValidationResult` interface: `{ valid, blocked?, reason?, hardGates, softGates, requiresProvisioning }`

In `GsdProject` interface, after `verifyFailureSummary`, added three optional fields:
- `stage?: ProjectStage`
- `stageUpdatedAt?: string | null`
- `stageNudgeDismissed?: boolean`

Extended `FeedEntry.type` union to include `'stage_change' | 'stage_nudge'`.

Extended `WSMessage.type` union to include `"project_stage_change"`.

### client/src/lib/api.ts

Added to imports: `GsdProject`, `ProjectStage`, `StageValidationResult`.

Added two methods to `api.gsd`:
- `stageTransition(projectName, targetStage)` — PATCH `/gsd/projects/:name/stage` with `{ to: targetStage }`
- `validateStageTransition(projectName, targetStage)` — POST `/gsd/projects/:name/stage/validate` with `{ to: targetStage }`

## Verification

- `grep "ProjectStage" client/src/lib/types.ts` — returns export line
- `grep "stage?" client/src/lib/types.ts` — returns GsdProject stage field
- `grep "stage_change" client/src/lib/types.ts` — returns FeedEntry union match
- `grep "project_stage_change" client/src/lib/types.ts` — returns WSMessage union match
- `grep "stageTransition" client/src/lib/api.ts` — returns method definition
- `tsc --noEmit` — 0 errors in types.ts and api.ts (35 pre-existing errors in other files, unchanged)
- `npm run test:client` — 64 pre-existing failures unchanged; no new failures introduced

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This plan adds type definitions only; no data flow or rendering.

## Threat Flags

No new network endpoints or auth paths introduced. Type-only plan; threat model T-58-12 (frontend ProjectStage constrains TypeScript to valid values) is satisfied.

## Self-Check: PASSED

- client/src/lib/types.ts — modified, confirmed
- client/src/lib/api.ts — modified, confirmed
- Commit 11870c8 — exists
- Commit 7bb38e1 — exists
