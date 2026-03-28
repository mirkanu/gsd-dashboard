---
phase: 20-fix-railway-deployment
plan: 01
subsystem: infra
tags: [railway, docker, vite, deploy, ci]

# Dependency graph
requires: []
provides:
  - "Live Railway dashboard showing alphabetically-sorted project cards"
  - "Paused projects hidden/collapsed in the GSD grid"
  - "Dockerfile post-build assertion (verify-build.sh) to catch silent Vite build failures"
affects: [future-deploys, dockerfile, railway]

# Tech tracking
tech-stack:
  added: []
  patterns: ["post-build dist assertion in Dockerfile to catch silent build failures"]

key-files:
  created:
    - client/scripts/verify-build.sh
  modified:
    - Dockerfile

key-decisions:
  - "Use sh (POSIX) instead of bash in verify-build.sh — Alpine Linux (Docker base) has no bash"
  - "Copy client/scripts/ before npm ci so postinstall (patch-dequal) can find its script"
  - "Threshold of 500 bytes for dist/index.html catches empty/stub outputs without false positives"

patterns-established:
  - "Verify-build pattern: run a fast assertion script after npm run build in Dockerfile to prevent silent failures from shipping"

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-03-28
---

# Phase 20 Plan 01: Fix Railway Deployment Summary

**Dockerfile post-build assertion (verify-build.sh) shipped via Railway to serve alphabetical sort + paused-card hiding in the live GSD dashboard**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-28T00:00:00Z
- **Completed:** 2026-03-28T00:00:00Z
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- Created `client/scripts/verify-build.sh` — asserts `dist/index.html` exists and exceeds 500 bytes after Vite build
- Updated `Dockerfile` Stage 2 to call `verify-build.sh` after `npm run build`, ensuring future silent build failures abort the deploy
- Deployed to Railway; live dashboard confirmed by user to show alphabetical project cards and hidden paused section

## Task Commits

Each task was committed atomically:

1. **Task 1: Add post-build dist verification and deploy** - `f1dfba3` (fix)
   - Additional fix: `cbc46ad` — copy client/scripts before npm ci so postinstall finds patch-dequal
   - Additional fix: `3eb49c5` — use sh instead of bash in verify-build (Alpine has no bash)
2. **Task 2: Verify live dashboard reflects alphabetical sort and paused hiding** - Human-verify checkpoint; approved by user

## Files Created/Modified
- `client/scripts/verify-build.sh` - Post-build assertion; exits non-zero if dist/index.html missing or under 500 bytes
- `Dockerfile` - Stage 2 now calls `RUN sh scripts/verify-build.sh` after `RUN npm run build`

## Decisions Made
- Used `sh` (POSIX shell) instead of `bash` in the script shebang and in the Dockerfile RUN command — Alpine Linux (the Docker base image) does not ship bash by default
- Moved `COPY client/scripts ./scripts` before `RUN npm ci` so the postinstall hook (`patch-dequal.cjs`) is available during dependency installation
- Set 500-byte minimum for `dist/index.html` as a pragmatic threshold that catches empty/stub files without producing false positives on legitimate minimal builds

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed bash not found in Alpine container**
- **Found during:** Task 1 (deploy + build)
- **Issue:** `verify-build.sh` used `#!/bin/bash` and Dockerfile used `RUN bash scripts/verify-build.sh`; Alpine has no bash, causing `exec format error` at build time
- **Fix:** Changed shebang to `#!/bin/sh`, replaced `bash` with `sh` in Dockerfile RUN
- **Files modified:** `client/scripts/verify-build.sh`, `Dockerfile`
- **Verification:** Subsequent Railway build succeeded
- **Committed in:** `3eb49c5`

**2. [Rule 3 - Blocking] Moved scripts COPY before npm ci**
- **Found during:** Task 1 (deploy + build)
- **Issue:** `patch-dequal.cjs` postinstall hook ran during `npm ci` but the scripts directory hadn't been copied yet, causing the build to fail
- **Fix:** Reordered Dockerfile to `COPY client/scripts ./scripts` before `RUN npm ci`
- **Files modified:** `Dockerfile`
- **Verification:** Build proceeded past npm ci without error
- **Committed in:** `cbc46ad`

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues)
**Impact on plan:** Both fixes were necessary to unblock the build. No scope creep.

## Issues Encountered
- Alpine-based Docker image lacks bash — required sh-only scripts throughout the verify step
- Dockerfile layer ordering meant postinstall couldn't find its own script — fixed by reordering COPY before npm ci

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Railway deployment pipeline is now hardened against silent build failures
- All v2.1 UI features (alphabetical sort, paused section) are live at https://gsd-dashboard-production.up.railway.app
- Ready to proceed with Phase 17 — Task Data Layer (v2.2 milestone)

---
*Phase: 20-fix-railway-deployment*
*Completed: 2026-03-28*
