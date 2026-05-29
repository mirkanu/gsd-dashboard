---
phase: 59-task-backend-migration-basic-issue-gui-wrapper
reviewed: 2026-05-29T12:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - client/src/components/GsdDrawer.tsx
  - client/src/components/ProjectDetailsPanel.tsx
  - client/src/components/StageTransitionModal.tsx
  - client/src/components/TasksTab.tsx
  - client/src/lib/api.ts
  - client/src/lib/types.ts
  - server/gsd/taskMigration.js
  - server/routes/gsd.js
  - server/__tests__/task-migration.test.js
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 59: Code Review Report

**Reviewed:** 2026-05-29T12:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 59 adds task-backend migration from Dashboard to GitHub Issues, with a rollback window, a migration step in the stage-transition modal, and a GitHub panel in the Tasks tab. The core logic is solid — snapshot-before-write, 7-day rollback, self-migration guard, and partial-failure gating are all present and tested. One critical bug was found: two declarations of `migrateTasksToGithub` and `rollbackTaskMigration` in `api.ts` leave the client calling the wrong endpoint signature. Four warnings cover missing input validation, a silent error swallow after task edit failures, incorrect use of `GSD_DATA_URL` forwarding for a new endpoint, and an unsafe `JSON.parse` in the rollback path. Three info items cover a missing WebSocket message type, duplicate component logic, and a test teardown smell.

---

## Critical Issues

### CR-01: Duplicate API method declarations — second definition silently overwrites the first

**File:** `client/src/lib/api.ts:183-236`

The `gsd` object in `api.ts` declares `migrateTasksToGithub` and `rollbackTaskMigration` twice. The first pair (lines 183–198) carries the correct response shape used by `StageTransitionModal` (`{ success, exported, failed, snapshotPath }`). The second pair (lines 226–236) declares a different shape (`{ success, task_backend, migratedAt }`) and overwrites the first at runtime because JavaScript evaluates object literals top-to-bottom — the last property wins.

Result: every caller (`StageTransitionModal.handleMigrateAndConfirm` at line 84, `TasksTab.handleMigrateLater` at line 303, `TasksTab.handleRollback` at line 289) receives the second definition's shape. `StageTransitionModal` reads `result.failed` (line 85) — that field does not exist on the second shape and will always be `undefined`, making the `result.failed.length > 0` guard always evaluate to `false`. Partial-failure detection silently breaks; the stage transition always proceeds even when GitHub issue creation failed.

**Fix:** Remove the duplicate declarations at lines 226–236. The first pair (lines 183–198) is the one that matches what the server actually returns and what `StageTransitionModal` expects.

```typescript
// DELETE lines 226–236 entirely:
//   migrateTasksToGithub: (projectName: string) =>
//     request<{ success: boolean; task_backend: 'github'; migratedAt: string }>(
//       ...
//     ),
//
//   rollbackTaskMigration: (projectName: string) =>
//     request<{ success: boolean; task_backend: 'dashboard' }>(
//       ...
//     ),
```

---

## Warnings

### WR-01: `JSON.parse` on untrusted snapshot file without error handling

**File:** `server/gsd/taskMigration.js:135`

`restoreSnapshot` reads the snapshot file with `JSON.parse(raw)` without a try/catch. If the snapshot file is malformed (truncated write, filesystem corruption, or manual edit), this throws an unhandled exception that propagates up to the route handler and produces a generic 500 error with no indication of the cause. A corrupt snapshot file prevents rollback.

**Fix:**
```javascript
let snapshot;
try {
  snapshot = JSON.parse(raw);
} catch (parseErr) {
  throw new Error(`Snapshot file at ${snapshotPath} is not valid JSON: ${parseErr.message}`);
}
```

### WR-02: `/migrate` proxy branch missing `Content-Type` header

**File:** `server/routes/gsd.js:991-997`

The `GSD_DATA_URL` proxy branch for `POST /projects/:name/migrate` calls `upstreamFetch` with a JSON body but does not pass a `Content-Type: application/json` header. Other proxy branches in the same file (e.g., stage transition at line 513, stage validate at line 577) explicitly set the header. Without it, the upstream server may reject the body or parse it incorrectly.

**Fix:**
```javascript
upstreamFetch(
  `${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(req.params.name)}/migrate`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body || {}),
    signal: AbortSignal.timeout(30000),
  }
)
```

The same issue applies to the `/rollback-migration` proxy branch at line 1069–1074.

### WR-03: Task edit failure silently leaves UI in inconsistent state

**File:** `client/src/components/TasksTab.tsx:177-197`

`handleSubmit` for the edit path (lines 177–197) has no `.catch` and no error display. The outer `try/finally` block only resets `submitting`; it does not revert `editingTask` or show an error to the user. If the PATCH request fails (network error, 404, 500), the edit form stays open with the modified values but the task list shows the old values — the user has no feedback and cannot tell whether the save succeeded.

**Fix:** Add a catch that displays an error. At minimum, store an error string in a state variable and render it near the Save button:

```typescript
const [editError, setEditError] = useState<string | null>(null);

// in handleSubmit catch block:
} catch (err) {
  setEditError(err instanceof Error ? err.message : 'Failed to save task');
} finally {
  setSubmitting(false);
}
```

### WR-04: Rollback 7-day check passes when `taskMigratedAt` is null or invalid

**File:** `server/routes/gsd.js:1091-1094`

```javascript
const migratedAt = new Date(project.taskMigratedAt);
const daysSince = (Date.now() - migratedAt.getTime()) / (1000 * 60 * 60 * 24);
if (daysSince > 7) { ... }
```

If `project.taskMigratedAt` is `null` (e.g., backfilled record with `task_backend: 'github'` but missing `taskMigratedAt`), `new Date(null)` produces the epoch (1970-01-01), so `daysSince` will be enormous and the rollback will be blocked with 410. This is arguably correct behaviour, but `new Date(undefined)` produces `Invalid Date` and `migratedAt.getTime()` returns `NaN`, making `daysSince` also `NaN`, so the `> 7` comparison is `false` and the 7-day guard is silently bypassed — rollback is allowed indefinitely.

**Fix:** Guard the value explicitly before computing:
```javascript
if (!project.taskMigratedAt) {
  return res.status(400).json({ error: 'Migration timestamp not recorded; cannot verify rollback window' });
}
const migratedAt = new Date(project.taskMigratedAt);
if (isNaN(migratedAt.getTime())) {
  return res.status(400).json({ error: 'Invalid migration timestamp' });
}
```

---

## Info

### IN-01: `task_backend_change` WebSocket message type not in `WSMessage` union

**File:** `client/src/lib/types.ts:469-479`

The server broadcasts `task_backend_change` events (gsd.js lines 1047, 1106) but the `WSMessage.type` union does not include this string. The event bus will parse and republish the message, but no subscriber will recognise it — the Tasks tab comment at `TasksTab.tsx:290` says "Parent will update via WebSocket task_backend_change broadcast" but no subscriber in `GSD.tsx` or elsewhere handles it. This means the task backend state in the project list does not update live after migration or rollback without a manual refresh.

**Fix:** Add the type to the union and wire a handler in `GSD.tsx`:
```typescript
// types.ts WSMessage.type union:
| "task_backend_change"

// GSD.tsx — in the eventBus.subscribe effect alongside project_state_change:
if (msg.type === 'task_backend_change') {
  const evt = msg.data as { project: string; task_backend: 'dashboard' | 'github'; github_repo: string | null; taskMigratedAt?: string | null };
  setProjects(prev => prev.map(p =>
    p.name === evt.project
      ? { ...p, task_backend: evt.task_backend, github_repo: evt.github_repo, taskMigratedAt: evt.taskMigratedAt ?? null }
      : p
  ));
}
```

### IN-02: `GsdDrawer` and `ProjectDetailsPanel` duplicate the same fetch logic

**File:** `client/src/components/GsdDrawer.tsx:40-62`, `client/src/components/ProjectDetailsPanel.tsx:49-71`

Both components contain byte-for-byte identical `useEffect` hooks (file-fetch, error dispatch, cancellation token). This is significant copy-paste — any future change (e.g., adding another 404 message variant) must be applied in both places. Consider extracting to a shared `useProjectFile(projectName, activeTab)` hook.

### IN-03: Test suite uses `setTimeout(() => process.exit(0), 100)` to force exit

**File:** `server/__tests__/task-migration.test.js:67`

Forcing process exit in the `after()` hook masks resource leaks (open handles, in-flight async ops) and makes the test runner unable to report failures that occur in teardown. It also prevents the test file from being safely composed with other test files in a single runner invocation. Use `--exit` on the test runner command instead, or investigate and close the open handles properly (the server `close()` callback and the `db.close()` call may need to be awaited).

---

_Reviewed: 2026-05-29T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
