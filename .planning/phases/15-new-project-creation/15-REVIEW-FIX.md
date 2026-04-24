---
phase: 15-new-project-creation
fixed_at: 2026-04-24T00:00:00Z
review_path: .planning/phases/15-new-project-creation/15-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-04-24
**Source review:** .planning/phases/15-new-project-creation/15-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Path traversal via unconstrained `basePath` parameter

**Files modified:** `server/routes/gsd.js`
**Commit:** 6d7faf0
**Applied fix:** Replaced the `path.isAbsolute()` check with an explicit `ALLOWED_BASES = ['/data/home']` allowlist. Any `basePath` value not in the allowlist silently falls back to `/data/home`. The test suite was also updated (commit 365bc13) to use `/data/home` as the test `basePath` instead of `os.tmpdir()`, since the old test relied on arbitrary-path behavior that the fix intentionally removes.

---

### WR-01: Race condition in `/projects/create` config update allows duplicate entries

**Files modified:** `server/routes/gsd.js`, `server/__tests__/api.test.js`
**Commits:** bbd36bc, 365bc13
**Applied fix:** Added a second duplicate check immediately before the `freshConfig.projects.push()` write, against the freshly-read config. This closes the race window where two concurrent requests could both pass the early check before either write completes. The early check is retained as a fast-path rejection (before directory/tmux side effects). The test file `basePath` was also updated here as part of the same correction commit.

---

### WR-02: `stateEnteredAt` resets to current time on cold snapshot

**Files modified:** `server/routes/gsd.js`
**Commit:** 2e59a6a
**Applied fix:** Changed the fallback from `new Date().toISOString()` to `null` when no broadcaster snapshot exists or the snapshot state does not match the detected state. The `ProjectCard` component already conditionally renders the elapsed label only when `stateEnteredAt` is truthy, so returning `null` safely hides the label instead of showing a misleading "0s ago".

---

### WR-03: `require('child_process')` called inside route handlers at runtime

**Files modified:** `server/routes/gsd.js`
**Commit:** 7a55f0d
**Applied fix:** Added `const { execFileSync, spawnSync } = require('child_process')` at the top of the module alongside all other requires. Removed the four inline `require('child_process')` calls from within the route handler functions (send-keys, start-session, kill-session, and create handlers).

---

_Fixed: 2026-04-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
