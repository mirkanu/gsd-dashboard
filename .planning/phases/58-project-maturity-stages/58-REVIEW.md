---
phase: 58-project-maturity-stages
reviewed: 2026-05-28T10:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - client/src/components/ChatListFilters.tsx
  - client/src/components/KillArchiveModal.tsx
  - client/src/components/ProjectControls.tsx
  - client/src/components/StageBackfillChip.tsx
  - client/src/components/StageBadge.tsx
  - client/src/components/StageTransitionModal.tsx
  - client/src/components/__tests__/StageBadge.test.tsx
  - client/src/components/__tests__/StageTransitionModal.test.tsx
  - client/src/lib/api.ts
  - client/src/lib/types.ts
  - client/src/pages/GSD.tsx
  - server/gsd/provisioning/betterStackProvisioner.js
  - server/gsd/provisioning/r2Provisioner.js
  - server/gsd/provisioning/stageGates/eligibilityChecker.js
  - server/gsd/provisioning/stageGates/validateGates.js
  - server/index.js
  - server/routes/gsd.js
  - server/routes/projects.js
  - server/__tests__/provisioning.test.js
  - server/__tests__/stage-nudges.test.js
  - server/__tests__/stage-transitions.test.js
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 58: Code Review Report

**Reviewed:** 2026-05-28T10:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Phase 58 adds project maturity stages (draft → alpha → beta → launched → maintenance → retired) with gate validation, auto-provisioning of BetterStack monitors and R2 buckets, stage nudge cron, and associated UI components. The implementation is generally solid — the transition allowlist is well-defined, the PATCH endpoint validates input before writing, and the UI correctly disables the confirm button when hard gates fail.

One critical issue: the PATCH stage endpoint in `server/routes/gsd.js` performs the transition unconditionally without re-running gate validation at write time. A user can open the `StageTransitionModal`, the validation fails the `productionUrl` hard gate, but if they call `PATCH /api/gsd/projects/:name/stage` directly (bypassing the UI), the transition succeeds. The gate check happens only in the separate `POST /stage/validate` endpoint.

Five warnings cover logic inconsistencies and missing error handling. Four info items cover code quality.

---

## Critical Issues

### CR-01: PATCH /stage does not enforce hard gates at write time

**File:** `server/routes/gsd.js:505-552`
**Issue:** `PATCH /api/gsd/projects/:name/stage` applies the stage transition as long as `ALLOWED_TRANSITIONS` permits it. It never calls `validateGates`. The `productionUrl` hard gate (required for `beta->launched`) is only checked in `POST /stage/validate`, which is a separate read-only endpoint called by the UI. Any client that calls PATCH directly — or a future code path that skips the modal — can advance a project to `launched` without a production URL or BetterStack monitor, silently leaving those unprovisioned.

**Fix:**
```javascript
// In PATCH /projects/:name/stage, after the ALLOWED_TRANSITIONS check:
const { validateGates } = require('../gsd/provisioning/stageGates/validateGates');
const gateResult = await validateGates(project, targetStage);
if (!gateResult.valid) {
  const failed = gateResult.hardGates.map(g => g.label).join('; ');
  return res.status(422).json({ error: `Stage transition blocked: ${failed}` });
}
// Then run provisioning for items in gateResult.requiresProvisioning before saving
```

---

## Warnings

### WR-01: Stage transition PATCH returns the full project object from config — includes provisioner secrets context

**File:** `server/routes/gsd.js:548`
**Issue:** `res.json({ success: true, stage: targetStage, project })` serializes the raw config entry, which may contain sensitive fields such as `github_url`, `tmux_session`, internal paths, and any ad-hoc keys added to `gsd-projects.json`. The `GsdProject` TypeScript type on the client only expects specific fields; the server sends the raw shape.

**Fix:** Project-scope the response to only the fields the client needs:
```javascript
res.json({
  success: true,
  stage: targetStage,
  project: {
    name: project.name,
    display_name: project.display_name || null,
    stage: project.stage,
    stageUpdatedAt: project.stageUpdatedAt,
  },
});
```

### WR-02: `KillArchiveModal` uses raw `fetch` for DELETE instead of the `api` wrapper — HTTP errors are silently swallowed

**File:** `client/src/components/KillArchiveModal.tsx:51-55`
**Issue:** The delete flow calls `fetch(...)` directly and does not check `response.ok` before calling `handleClose()` and `onDeleted()`. If the server returns a 4xx/5xx (e.g., non-draft stage check fails with 422), the UI will report success, close the modal, and call `onDeleted()` even though nothing was deleted.

```typescript
// Current — no error check:
await fetch(`/api/gsd/projects/${encodeURIComponent(project.name)}`, { method: "DELETE" });
handleClose();
onDeleted();
```

**Fix:** Use the `api` wrapper or explicitly check `response.ok`:
```typescript
const resp = await fetch(`/api/gsd/projects/${encodeURIComponent(project.name)}`, {
  method: "DELETE",
});
if (!resp.ok) {
  const body = await resp.json().catch(() => ({}));
  throw new Error(body?.error || `Delete failed (${resp.status})`);
}
handleClose();
onDeleted();
```

### WR-03: `loadConfigWithBackfill` auto-writes `stage: 'draft'` to every stageless project on every call to the validate or PATCH endpoint — no mutex

**File:** `server/routes/gsd.js:49-61`
**Issue:** `loadConfigWithBackfill` reads, mutates, and writes `gsd-projects.json` synchronously if any project is missing a `stage` field. Both `PATCH /stage` and `POST /stage/validate` call it, so if two requests arrive concurrently (e.g., the UI sends a validate + PATCH in quick succession), both will read the old file, mark the same project as `dirty`, and independently write it back. The second write overwrites the first. This is the same pattern as the existing project creation race that the code comment at line 826 in `gsd.js` already acknowledges — the difference is that backfill runs on every request, not just creation.

**Fix:** Perform the backfill as a one-time startup migration (add it to `startServer` after config is loaded) rather than lazily on each request. Alternatively, guard with a file-level lock or check `project.stage` before writing.

### WR-04: Stage grouping in GSD.tsx always falls back to `draft` for unstaged projects, hiding them from filters

**File:** `client/src/pages/GSD.tsx:1385`
**Issue:** When `groupBy === 'stage'`, the filter expression is `(p.stage ?? 'draft') === stage`. This means projects without an assigned stage are rendered under the "Draft" group header. Meanwhile, the filter bar still uses `sessionState`-based filtering. If `activeFilter` is set to "Waiting" and `groupBy` is "stage", the filter bar filter is ignored entirely — the stage groups show all non-archived projects regardless of `sessionState`.

```typescript
// Line 1385 — activeFilter is never applied here:
const stageProjects = projects.filter(p =>
  (p.stage ?? 'draft') === stage && p.sessionState !== 'archived'
);
```

**Fix:** Apply `activeFilter` in the stage group filter too:
```typescript
const stageProjects = projects.filter(p => {
  if (p.sessionState === 'archived') return false;
  if (activeFilter !== null && p.sessionState !== activeFilter) return false;
  return (p.stage ?? 'draft') === stage;
});
```

### WR-05: `eligibilityChecker.js` runs `git rev-list --count HEAD` in the project root using `execFileSync` — blocks the Node.js event loop

**File:** `server/gsd/provisioning/stageGates/eligibilityChecker.js:20-28`
**Issue:** `meetsNudgeCriteria` is called inside a `setInterval` loop in `server/index.js` (line 244) that iterates over all projects. Each call synchronously runs a child process with a 5-second timeout. For N projects this blocks the event loop for up to N×5 seconds, which will trigger the 30-second watchdog (`server/index.js:358`) for large project counts and cause PM2 restart.

**Fix:** Use `execFile` (async) instead of `execFileSync`:
```javascript
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function meetsNudgeCriteria(project, opts = {}) {
  // ... same date check ...
  try {
    const { stdout } = await execFileAsync('git',
      ['-C', project.root, 'rev-list', '--count', 'HEAD'],
      { timeout: 5000 }
    );
    const commitCount = parseInt(stdout.trim(), 10);
    return !isNaN(commitCount) && commitCount >= commitsThreshold;
  } catch {
    return false;
  }
}
```

The `setInterval` caller in `index.js` already wraps in `async` so awaiting this is straightforward.

---

## Info

### IN-01: `ALLOWED_TRANSITIONS` is defined twice — once in `gsd.js` and once in `validateGates.js`

**File:** `server/routes/gsd.js:64-71` and `server/gsd/provisioning/stageGates/validateGates.js:6-13`
**Issue:** The transition allowlist is duplicated verbatim. If a new transition is added (e.g., `retired->alpha`), it must be added in both places or behavior will diverge. The PATCH handler uses `gsd.js`'s copy; the validate endpoint uses `validateGates.js`'s copy.

**Fix:** Export `ALLOWED_TRANSITIONS` from `validateGates.js` and import it in `gsd.js`:
```javascript
// In gsd.js — replace the local Set with:
const { ALLOWED_TRANSITIONS } = require('../gsd/provisioning/stageGates/validateGates');
```

### IN-02: `StageTransitionModal` does not show passing gates — the prerequisites section is always empty when all gates pass

**File:** `client/src/components/StageTransitionModal.tsx:111-124`
**Issue:** Only failing hard gates and failing soft gates are rendered. When `gates.valid === true` and there are no failures, the prerequisites section has a header ("Prerequisites") but an empty body — it shows nothing under the label, which looks broken.

**Fix:** Either hide the prerequisites header when there are no items to show, or add a "All checks passed" confirmation line:
```tsx
{gates && (gates.hardGates.length > 0 || gates.softGates.some(g => !g.pass) || needsProvisioning) && (
  <div className="space-y-2 mb-4">
    {/* ... existing content ... */}
  </div>
)}
```

### IN-03: `GSD.tsx` `NewProjectDialog` builds a `GsdProject` with missing required fields

**File:** `client/src/pages/GSD.tsx:987-1001`
**Issue:** The optimistic `GsdProject` built after project creation omits several fields that are defined as required in the `GsdProject` interface: `sessionState`, `statusText`, `sessionCost`, `stateEnteredAt`, `currentTask`, `display_name`, `streak`, `velocity`, `estimatedCompletion`. TypeScript should catch this, but only if the type is imported cleanly. The object is passed to `onCreated` which calls `setProjects(prev => [project, ...prev])`, so the partial object enters React state and could cause downstream null dereferences in components that don't guard these fields.

**Fix:** Provide all required fields or use a factory:
```typescript
const newProject: GsdProject = {
  name: project.name,
  root: project.root,
  display_name: null,
  state: null,
  roadmap: null,
  requirements: null,
  version: null,
  liveUrl: null,
  velocity: 0,
  streak: 0,
  estimatedCompletion: null,
  tmuxActive: true,
  tmuxSession: project.tmux_session,
  contextTokens: null,
  sessionUpdatedAt: null,
  sessionState: 'waiting',
  statusText: null,
  sessionCost: null,
  stateEnteredAt: null,
  currentTask: null,
};
```

### IN-04: `stage-transitions.test.js` uses `setTimeout(() => process.exit(0), 100)` to exit after tests — unreliable teardown pattern

**File:** `server/__tests__/stage-transitions.test.js:51`
**Issue:** Forcing `process.exit(0)` with a hard-coded 100ms delay is a workaround for test runner teardown. If any async operation takes longer than 100ms after `after()` completes, it will be killed mid-flight, which can leave the temp DB files undeleted and cause flaky test isolation on slow CI machines.

**Fix:** Use `--exit` flag with `node --test` (already implicit in the project's test runner) rather than calling `process.exit` explicitly in teardown. If the server's `close()` does not drain all connections, call `server.closeAllConnections()` (Node 18.2+) before resolving.

---

_Reviewed: 2026-05-28T10:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
