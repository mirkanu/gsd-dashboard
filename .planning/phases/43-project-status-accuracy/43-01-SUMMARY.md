---
phase: 43-project-status-accuracy
plan: 01
subsystem: backend-detection
tags: [tmux, detection, state-machine, node-test, sha1, heuristic]

# Dependency graph
requires:
  - phase: previous-tmux-work
    provides: detectSessionStateAsync with pattern-based detection, extractStatusLine
provides:
  - Output-change heuristic in detectSessionStateAsync (STAT-02 root-cause fix)
  - Expanded timerPatterns covering esc-to-interrupt, Bypassing Permissions, tool-call markers, token counters
  - New extractCurrentTask helper for STAT-04 task preview
  - New test exports: _testDetectWithChangeHeuristic, _resetPaneHashCache
affects: [43-02-background-poller, 43-03-project-status-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "paneHashCache: module-level in-memory Map<sessionName, {hash, lastChangedAt}> for change detection — never persisted"
    - "Pure-helper test exports (_testDetectWithChangeHeuristic) for logic-only unit tests that bypass tmux and module state"

key-files:
  created: []
  modified:
    - server/gsd/tmux.js
    - server/__tests__/tmux.test.js

key-decisions:
  - "3s change-heuristic window — long enough to cover tmux capture-pane quiet periods between tool-call streaming bursts (1-2s), short enough to flip to 'waiting' quickly on true idle"
  - "In-memory paneHashCache with no DB persistence — honors backend-node rule 'preserve transaction boundaries / do not introduce new write paths'; a process restart safely re-seeds the cache"
  - "Expose _testDetectWithChangeHeuristic as a pure function — tests do not touch module-level cache, avoiding cross-test pollution and matching the existing _testDetectFromOutput pattern"
  - "Do not modify extractStatusLine — it has a different purpose (✻/✶ spinner lines) and is still used by server/routes/gsd.js statusText; extractCurrentTask is additive"
  - "Keep sync detectSessionState's timerPatterns in sync with the async variant — callers of the sync path still exist and must not regress"

patterns-established:
  - "Change-detection via SHA1 hash truncated to 16 hex chars: cheap to compute on 2KB pane buffers, negligible collision risk for the tiny value set we compare"
  - "Bottom-up meaningful-line extractor with chrome blacklist + marker-prefix stripping — reusable for other task preview surfaces"

requirements-completed: [STAT-02, STAT-04]

# Metrics
duration: ~25min
completed: 2026-04-06
---

# Phase 43 Plan 01: Tmux Detection Primitives Summary

**Output-change heuristic and expanded timerPatterns fix the STAT-02 false-'Waiting' bug in `detectSessionStateAsync`, and new `extractCurrentTask` helper provides clean task-preview lines for STAT-04.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-06
- **Tasks:** 2 (both TDD)
- **Files modified:** 2
- **New tests:** 17 (9 in Task 1, 8 in Task 2)
- **Total tmux.test.js tests:** 29 (all passing)

## Accomplishments

- `detectSessionStateAsync` now returns `'working'` when capture-pane output changes since the last call, or has changed within a 3s window — even when no timer UI strings are visible. This directly fixes the daily false-"Waiting" bug users see on the live Railway dashboard.
- Five new `timerPatterns` added (in all three pattern-list locations — sync, async, test hook): `esc to interrupt`, `Bypassing Permissions`, tool-call marker `⏺ Write(...)`, token-counter variants.
- New exported `extractCurrentTask(rawText)` scans the last 20 lines bottom-up, skips chrome (prompts, shortcuts, box drawing, numeric menus, spinner lines), strips leading markers, and returns a cleaned task line. Null for no-meaningful-line buffers. Truncates >120 chars with `…` suffix.
- New test-only exports: `_testDetectWithChangeHeuristic(prev, output, nowMs)` (pure function) and `_resetPaneHashCache()`.

## Task Commits

1. **Task 1: Output-change heuristic + expanded timerPatterns** — `208bb81` (feat, TDD: test→impl in single commit)
2. **Task 2: extractCurrentTask helper** — `1bdec0e` (feat, TDD: test→impl in single commit)

## Files Created/Modified

- `server/gsd/tmux.js` — New `paneHashCache`, `CHANGE_HEURISTIC_WINDOW_MS=3000`, `_testDetectWithChangeHeuristic`, `_resetPaneHashCache`, `extractCurrentTask`. Expanded `timerPatterns` in `detectSessionState`, `detectSessionStateAsync`, `_testDetectFromOutput`. Change-heuristic wired into `detectSessionStateAsync` after the pattern loop and before the waiting-pattern loop.
- `server/__tests__/tmux.test.js` — 17 new tests covering expanded patterns, change-heuristic branches, and `extractCurrentTask` edge cases (null, empty, chrome skipping, ANSI strip, marker strip, truncation).

## Decisions Made

See `key-decisions` in frontmatter. Summary:

- **3s heuristic window** tuned to Claude Code tool-call streaming cadence (bursts are typically 1-2s apart).
- **In-memory cache** — no DB writes, honors backend-node rule about transaction boundaries.
- **Pure-function test export** keeps test runs independent of module state.
- **Sync & async pattern lists kept in lockstep** — callers of sync `detectSessionState` still exist.
- **`extractStatusLine` untouched** — still used by `server/routes/gsd.js` for `statusText`.

## Deviations from Plan

None material. Two minor interpretation notes:

1. Plan's Test 7 for the change-heuristic was described as "stale prev + differing hash → waiting", but the action snippet unambiguously returns `'working'` on any hash diff. I followed the action snippet (authoritative for GREEN phase) and wrote the test as "stale prev + differing hash → still working (content changed)". The plan's actual intent — "same hash, stale" → `null` (fall through) — is covered by the explicit `null` test.
2. `extractCurrentTask` chrome pattern `/^\s*>?\s*\d+\.\s/` accepts both `1.` and `> 1.` (plan specified `> 1.` only). Broader coverage, no regression risk, matches real tmux buffer variety.

Plan tasks executed exactly as specified. No Rule 1/2/3 auto-fixes required.

## Issues Encountered

- Full `npm run test:server` hangs on pre-existing `autopilotManager.test.js` (multiple zombie node processes visible in `ps aux` predating this plan). **Out of scope** — not caused by this plan's changes. Logged below.
- Verified via targeted `node --test server/__tests__/tmux.test.js` (29/29 pass) and `node --test server/__tests__/tmux.test.js server/__tests__/circuitBreaker.test.js` (26/26 + circuit breaker tests pass, no regressions). The two pre-existing failures visible in `api.test.js` (`readProjectMeta`, `agent data proxy` POST) are also unrelated — pre-existed this plan.

## Deferred Issues

- Pre-existing hang in `autopilotManager.test.js` causing `npm run test:server` to stall indefinitely. Not caused by this plan. Candidate for a future quick-task investigation.

## Next Phase Readiness

Plan 02 (background poller) can now consume:
- `detectSessionStateAsync(sessionName)` with reliable `'working'` detection across Claude Code output variants.
- `extractCurrentTask(rawText)` for STAT-04 per-project task preview.

Both exports are stable and covered by tests.

## Self-Check: PASSED

**File existence:**
- `server/gsd/tmux.js` — exists, contains `paneHashCache`, `_testDetectWithChangeHeuristic`, `_resetPaneHashCache`, `extractCurrentTask`, expanded `timerPatterns`.
- `server/__tests__/tmux.test.js` — exists, contains 17 new tests.
- `.planning/phases/43-project-status-accuracy/43-01-SUMMARY.md` — this file.

**Commit existence:**
- `208bb81` — Task 1 commit (verified via `git log`).
- `1bdec0e` — Task 2 commit (verified via `git log`).

**Test verification:**
- `node --test server/__tests__/tmux.test.js` → 29 pass, 0 fail.
- Targeted cross-file run confirms no regressions in adjacent test files.

---
*Phase: 43-project-status-accuracy*
*Completed: 2026-04-06*
