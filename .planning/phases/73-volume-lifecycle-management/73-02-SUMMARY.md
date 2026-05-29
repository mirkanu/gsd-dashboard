---
phase: 73-volume-lifecycle-management
plan: "02"
subsystem: client-ui
tags: [docker, oom, server-page, types, api]
dependency_graph:
  requires: []
  provides: [DockerDf-types, OomStatus-types, api-dockerDf, api-oomStatus, docker-disk-ui, oom-ui]
  affects: [client/src/lib/types.ts, client/src/lib/api.ts, client/src/pages/ServerPage.tsx]
tech_stack:
  added: []
  patterns: [one-shot-useEffect-fetch, conditional-amber-threshold, static-label-card-subsection]
key_files:
  created: []
  modified:
    - client/src/lib/types.ts
    - client/src/lib/api.ts
    - client/src/pages/ServerPage.tsx
decisions:
  - OOM section always renders (no conditional on oomStatus) — shows "—" while loading so Claude cap label is always visible
  - Build Cache amber threshold at >5 GB reclaimable parsed from string (GB or MB units)
  - docker-df and oom-status fetches are one-shot on mount only, not in setInterval
metrics:
  duration: "~7 minutes"
  completed: "2026-05-29"
  tasks_completed: 2
  files_modified: 3
---

# Phase 73 Plan 02: Docker Disk Breakdown and OOM Protection UI Summary

TypeScript types, API client methods, and ServerPage UI for Docker space breakdown (4-row table with amber Build Cache threshold) and earlyoom health status with static Claude cgroup cap label.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add DockerDf/OomStatus types and api.ts system methods | 37b6554 | client/src/lib/types.ts, client/src/lib/api.ts |
| 2 | Add Docker and OOM Protection sub-sections to ServerPage | eba1e47 | client/src/pages/ServerPage.tsx |

## What Was Built

**Task 1 — Types and API:**
- Added `DockerDfEntry`, `DockerDf`, `OomStatus` interfaces to `client/src/lib/types.ts` (after `RunCronResult`)
- Extended `api.ts` imports with `DockerDf` and `OomStatus`
- Added `dockerDf()` and `oomStatus()` methods to `api.system` block

**Task 2 — UI:**
- Imported `DockerDf` and `OomStatus` into `ServerPage.tsx`
- Added `dockerDf` and `oomStatus` state variables
- One-shot fetch of both on mount (not in `setInterval`)
- Docker sub-section inside Disk Usage card: 4 rows (Images, Containers, Local Volumes, Build Cache) with size and reclaimable; Build Cache row highlighted amber when reclaimable > 5 GB
- OOM Protection sub-section inside Memory card: earlyoom active (text-emerald-400) / inactive (text-destructive) dot + static "2.4 GB cgroup" Claude cap label

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — both new endpoints are read-only fetches matching T-73-05/06/07 in the plan's threat model. The `.catch(() => {})` pattern on both fetches implements the T-73-07 DoS mitigation as specified.

## Known Stubs

None — both sub-sections show "Loading..." (dockerDf) and "—" (oomStatus) while data is in flight, and "unavailable" (dockerDf.error) when API fails. No hardcoded placeholder data flows to rendering.

## Verification

- TypeScript: `npx tsc --noEmit` — clean (no errors)
- Build: `npm run build` — OK
- Client tests: 92 failed / 80 passed — identical to pre-change baseline (pre-existing React production build / act() failures in KanbanBoard tests, unrelated to this plan)

## Self-Check: PASSED

- `client/src/lib/types.ts` contains `DockerDfEntry` — FOUND
- `client/src/lib/types.ts` contains `OomStatus` — FOUND
- `client/src/lib/api.ts` contains `dockerDf` — FOUND
- `client/src/lib/api.ts` contains `oomStatus` — FOUND
- `client/src/pages/ServerPage.tsx` contains `OOM Protection` — FOUND
- `client/src/pages/ServerPage.tsx` contains `2.4 GB cgroup` — FOUND
- `client/src/pages/ServerPage.tsx` contains `text-amber-400` — FOUND
- Commit 37b6554 exists — FOUND
- Commit eba1e47 exists — FOUND
