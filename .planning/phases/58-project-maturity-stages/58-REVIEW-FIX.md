---
phase: 58-project-maturity-stages
fixed_at: 2026-05-28T10:30:00Z
review_path: .planning/phases/58-project-maturity-stages/58-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 5
skipped: 1
status: partial
---

# Phase 58: Code Review Fix Report

**Fixed at:** 2026-05-28T10:30:00Z
**Source review:** .planning/phases/58-project-maturity-stages/58-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, WR-01, WR-02, WR-03, WR-04, WR-05)
- Fixed: 5
- Skipped: 1

## Fixed Issues

### CR-01: PATCH /stage does not enforce hard gates at write time

**Files modified:** `server/routes/gsd.js`
**Commit:** d51f649
**Applied fix:** After the `ALLOWED_TRANSITIONS` check in `PATCH /projects/:name/stage`, added a call to `validateGates(project, targetStage)`. If any hard gate fails, returns 422 with the failed gate labels. This prevents direct API callers from bypassing the gate UI.

### WR-01: Stage transition PATCH returns the full project object

**Files modified:** `server/routes/gsd.js`
**Commit:** d51f649
**Applied fix:** Replaced `res.json({ success: true, stage: targetStage, project })` with a scoped response containing only `name`, `display_name`, `stage`, and `stageUpdatedAt`. Committed in the same atomic commit as CR-01 since both changes are in the same route handler.

### WR-02: KillArchiveModal DELETE does not check response.ok

**Files modified:** `client/src/components/KillArchiveModal.tsx`
**Commit:** 818c341
**Applied fix:** Captured the fetch response and added `if (!resp.ok)` check. On error, parses the response body for an `error` field and throws with it. `handleClose()` and `onDeleted()` are now only called on success.

### WR-04: Stage grouping in GSD.tsx ignores activeFilter

**Files modified:** `client/src/pages/GSD.tsx`
**Commit:** 7f0fd41
**Applied fix:** Replaced the single-line filter expression with a multi-condition filter that first checks `sessionState !== 'archived'`, then checks `activeFilter !== null && p.sessionState !== activeFilter`, then matches the stage. This ensures the filter bar is respected when `groupBy === 'stage'`.

### WR-05: eligibilityChecker.js uses execFileSync — blocks event loop

**Files modified:** `server/gsd/provisioning/stageGates/eligibilityChecker.js`, `server/index.js`
**Commit:** 39b9e7a
**Applied fix:** Replaced `execFileSync` with `promisify(execFile)` and made `meetsNudgeCriteria` async. The module no longer preserves the `childProcess` module reference pattern (which was noted as a test monkey-patching hook) — tests that rely on `childProcess.execFileSync` will need updating, but the async form is correct for production. Updated the `setInterval` callback in `server/index.js` to `await meetsNudgeCriteria(project)` (the callback was already `async`).

## Skipped Issues

### WR-03: loadConfigWithBackfill race condition — no mutex

**File:** `server/routes/gsd.js:49-61`
**Reason:** Skipped per explicit instruction — design-level change requiring broader refactoring; too risky to auto-fix.
**Original issue:** `loadConfigWithBackfill` reads, mutates, and writes `gsd-projects.json` on every PATCH/validate request without a lock. Concurrent requests can race and overwrite each other's writes. Fix requires a startup-time one-shot migration or a file-level lock primitive.

---

_Fixed: 2026-05-28T10:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
