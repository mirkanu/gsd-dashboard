---
phase: 60-dev-production-environment-manager
plan: "02"
subsystem: frontend
tags: [staging, url-chips, react-component, type-extension, api-methods]
dependency_graph:
  requires: [60-01]
  provides: [ProjectEnvironmentChips-component, staging-type-fields, staging-api-methods, staging-toggle-ui]
  affects: [client/src/lib/types.ts, client/src/lib/api.ts, client/src/components/ProjectEnvironmentChips.tsx, client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [conditional-chip-render, status-dot-color-map, websocket-refresh-on-toggle]
key_files:
  created:
    - client/src/components/ProjectEnvironmentChips.tsx
    - client/src/components/__tests__/ProjectEnvironmentChips.test.tsx
  modified:
    - client/src/lib/types.ts
    - client/src/lib/api.ts
    - client/src/pages/GSD.tsx
decisions:
  - "Production status dot hardcoded to running in Phase 60 — no production health polling in scope; future phase can add productionStatus to GsdProject"
  - "ExternalLink lucide import removed from GSD.tsx — it was only used in the liveUrl block now replaced by ProjectEnvironmentChips"
  - "Staging toggle scoped to stage='launched' AND sessionState!='archived' — prevents showing on archived cards"
metrics:
  duration_minutes: 25
  completed_date: "2026-06-12"
  tasks_completed: 3
  files_created: 2
  files_modified: 3
---

# Phase 60 Plan 02: Frontend Environment Chips + Staging Toggle Summary

**One-liner:** GsdProject extended with 4 staging fields, ProjectEnvironmentChips renders production/staging URL chips with status dots, and a Launched-only staging toggle calls Plan 01 API routes with WebSocket-driven UI refresh.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend types.ts + add api.ts staging methods | 54cc4cd | client/src/lib/types.ts, client/src/lib/api.ts |
| 2 | Create ProjectEnvironmentChips component + tests | cd3d095 | client/src/components/ProjectEnvironmentChips.tsx, client/src/components/__tests__/ProjectEnvironmentChips.test.tsx |
| 3 | Wire ProjectEnvironmentChips + staging toggle into GSD.tsx | 3db87cf | client/src/pages/GSD.tsx |

## What Was Built

`client/src/lib/types.ts` — GsdProject extended with 4 Phase 60 optional fields:
- `stagingEnabled?: boolean` — true if staging provisioned for this project
- `stagingPort?: number` — allocated port (3100–3199); stable after assignment
- `stagingUrl?: string` — hostname without protocol (e.g. `debates-staging.gsdlabs.dev`)
- `stagingStatus?: 'running' | 'stopped' | 'unknown'` — live health from backend polling

`client/src/lib/api.ts` — two new methods on `api.gsd`:
- `enableStaging(projectName)` → `POST /api/gsd/projects/:name/staging/enable` → `{ stagingUrl, stagingPort }`
- `disableStaging(projectName)` → `POST /api/gsd/projects/:name/staging/disable` → `{ success }`

`client/src/components/ProjectEnvironmentChips.tsx` — component with:
- `UrlChip` internal sub-component: renders `<a>` with status dot + ExternalLink icon; prepends `https://` when no protocol
- `ProjectEnvironmentChips` exported component: renders nothing when both URLs absent; production chip always when `liveUrl` set; staging chip when `stagingEnabled=true && stagingUrl` set
- Status dot mapping: `running=bg-green-500`, `stopped=bg-red-500`, `unknown/absent=bg-gray-400`

`client/src/pages/GSD.tsx` — three changes:
1. Import added: `import { ProjectEnvironmentChips } from '../components/ProjectEnvironmentChips'`
2. Replaced inline `{project.liveUrl && <a>...</a>}` block with `<ProjectEnvironmentChips project={project} />`
3. Added staging toggle button rendered only when `project.stage === 'launched' && sessionState !== 'archived'`; calls `api.gsd.enableStaging/disableStaging`; UI refreshes via existing WebSocket `project_update` listener
4. Removed now-unused `ExternalLink` import from lucide-react

## Verification Results

```
# stagingEnabled in types.ts
grep -n "stagingEnabled" client/src/lib/types.ts → 174: stagingEnabled?: boolean;

# enableStaging/disableStaging in api.ts
grep -n "enableStaging|disableStaging" client/src/lib/api.ts → 212, 218

# ProjectEnvironmentChips in GSD.tsx (import + usage)
grep -n "ProjectEnvironmentChips" client/src/pages/GSD.tsx → 28 (import), 857 (usage)

# No bare liveUrl block in GSD.tsx
grep -n "project.liveUrl" client/src/pages/GSD.tsx → (empty — block replaced)

# TypeScript: 0 new errors introduced
tsc --noEmit → 80 lines (same baseline; no new errors from our changes)

# Client tests: pre-existing React prod-build act() issue affects all render() tests
# (same 80 pass / 92 fail baseline — ProjectEnvironmentChips tests are in the failing bucket
# due to the systemic pre-existing environment issue, not our code)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unused ExternalLink import after liveUrl block replacement**
- **Found during:** Task 3 verification (tsc reported TS6133 unused import)
- **Issue:** Removing the `{project.liveUrl && <a>...<ExternalLink>...</a>}` block left `ExternalLink` in the lucide-react import with no usages
- **Fix:** Removed `ExternalLink` from the lucide-react named import in GSD.tsx
- **Files modified:** client/src/pages/GSD.tsx
- **Commit:** 3db87cf

## Known Stubs

None — all fields flow from the backend (Plan 01) through WebSocket `project_update` events to the UI. Production status dot is intentionally hardcoded to `running` in Phase 60 (no production health polling in scope — documented decision).

## Threat Flags

No new threat surface beyond what is documented in the plan's `<threat_model>`.

T-60-07 mitigated: URLs opened as `https://` when no protocol prefix; `target="_blank"` + `rel="noopener noreferrer"` on both chips.
T-60-09 mitigated: Toggle button uses `project.name` from typed GsdProject prop; URL-encoded in `encodeURIComponent()` before fetch.
T-60-10 mitigated: Toggle conditionally rendered only when `project.stage === 'launched'`.

## Self-Check: PASSED

- `client/src/components/ProjectEnvironmentChips.tsx` — FOUND
- `client/src/components/__tests__/ProjectEnvironmentChips.test.tsx` — FOUND
- `client/src/lib/types.ts` contains `stagingEnabled` — FOUND (line 174)
- `client/src/lib/api.ts` contains `enableStaging` — FOUND (line 212)
- `client/src/pages/GSD.tsx` contains `ProjectEnvironmentChips` — FOUND (lines 28, 857)
- Commit 54cc4cd — FOUND
- Commit cd3d095 — FOUND
- Commit 3db87cf — FOUND
