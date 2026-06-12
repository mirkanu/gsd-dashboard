---
phase: 60-dev-production-environment-manager
reviewed: 2026-06-12T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - client/src/components/ProjectEnvironmentChips.tsx
  - client/src/components/__tests__/ProjectEnvironmentChips.test.tsx
  - client/src/lib/api.ts
  - client/src/lib/types.ts
  - client/src/pages/GSD.tsx
  - package.json
  - server/__tests__/provisioning-staging.test.js
  - server/gsd/stagingProvisioner.js
  - server/routes/gsd.js
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 60: Code Review Report

**Reviewed:** 2026-06-12
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 60 adds opt-in staging environment provisioning: a backend provisioner that manages Cloudflare Tunnel ingress rules, a pair of API routes, and a frontend chip component that shows Production/Staging URL links per project card. The overall approach is sound — the atomic-write + lock pattern on the YAML config file is correct, the port allocation is deterministic, and the chip component is clean. Four warnings need attention before shipping.

The most impactful issue is the lock chain pattern in `stagingProvisioner.js` (`configWriteLock = configWriteLock.then(...)`) which causes a silent failure on any error inside the chain — the lock resolves and the returned result is wrong, but no exception propagates to callers. A secondary issue is that the staging toggle button in `GSD.tsx` is not guarded against concurrent clicks, so a double-tap can submit two conflicting enable/disable requests.

---

## Warnings

### WR-01: `configWriteLock` chain swallows errors and returns stale result

**File:** `server/gsd/stagingProvisioner.js:71-94` (and 106-119)

**Issue:** Both `addStagingIngress` and `removeStagingIngress` assign a new `.then()` to `configWriteLock` and then `await configWriteLock`. If the callback inside `.then()` throws (e.g., `fs.readFileSync` fails, the YAML is malformed, or `atomicWrite` throws), the error is caught by the Promise chain internally, the lock settles as **rejected**, and then the `await configWriteLock` re-throws — but only on the *next* call. On the current call, `configWriteLock` is still the *previous* settled promise when `await configWriteLock` is hit (the assignment to the new `.then()` promise happens, but the `await` runs before that new promise settles unless Node schedules it correctly).

More concretely: the pattern `configWriteLock = configWriteLock.then(cb); await configWriteLock;` races. The `await` is on the newly assigned promise, which is correct *only* if nothing else is also awaiting the same reference. But if a second concurrent call arrives, both threads share the same module-level `configWriteLock` and both reassign it, so one of them may await the wrong promise generation.

The idiomatic safe pattern is a mutex helper — or at minimum, wrapping in a try/catch so a thrown error inside `.then()` resets the lock rather than poisoning the chain for future calls.

**Fix:**
```js
async function withConfigLock(fn) {
  let resolve;
  const next = new Promise(r => { resolve = r; });
  const prev = configWriteLock;
  configWriteLock = next;
  try {
    await prev;
    return await fn();
  } finally {
    resolve();
  }
}

async function addStagingIngress(projectSlug, port) {
  const hostname = `${projectSlug}-staging.gsdlabs.dev`;
  const service  = `http://localhost:${port}`;
  await withConfigLock(async () => {
    const raw = fs.readFileSync(TUNNEL_CONFIG_PATH, 'utf8');
    const cfg = YAML.parse(raw);
    // ... rest of the logic
  });
  return { success: true, message: `Added staging ingress for ${hostname} → ${service}` };
}
```

---

### WR-02: Staging toggle button has no in-flight guard — concurrent requests possible

**File:** `client/src/pages/GSD.tsx:924-944`

**Issue:** The staging toggle `<button>` in `ProjectCard` fires an async request (`api.gsd.enableStaging` / `api.gsd.disableStaging`) without any loading/disabled state. On a slow connection, double-tapping the button submits two conflicting requests: an enable followed immediately by a disable (or vice versa), leaving the config in an indeterminate state. Because `stagingProvisioner` serialises writes via the lock, both will eventually execute sequentially — the second one wins and the UI and backend are out of sync until the next poll.

**Fix:** Track a per-project staging loading state and disable the button while the request is in flight, following the same pattern used for the existing "Re-open" tmux button:
```tsx
const [stagingLoading, setStagingLoading] = useState(false);

// ...
<button
  disabled={stagingLoading}
  onClick={async (e) => {
    e.stopPropagation();
    if (stagingLoading) return;
    setStagingLoading(true);
    try {
      if (project.stagingEnabled) {
        await api.gsd.disableStaging(project.name);
      } else {
        await api.gsd.enableStaging(project.name);
      }
    } catch (err) {
      console.error('Staging toggle failed:', err);
    } finally {
      setStagingLoading(false);
    }
  }}
  className="... disabled:opacity-50"
>
  {stagingLoading ? '…' : project.stagingEnabled ? 'Staging: on' : 'Staging: off'}
</button>
```

---

### WR-03: `enableStaging` response shape mismatch — API client type is broader than route returns

**File:** `server/routes/gsd.js:712` / `client/src/lib/api.ts:212-215`

**Issue:** The `enableStaging` route at line 712 returns `{ success, stagingUrl, stagingPort, stagingStatus }`. The TypeScript client (`api.ts:212`) types the return as `{ stagingUrl: string; stagingPort: number }` — missing `success` and `stagingStatus`. This is not a runtime crash, but callers that destructure the result (now or in future) will silently get `undefined` for `stagingStatus`, and TypeScript will not warn about accessing the missing `success` field.

Conversely, `disableStaging` route (line 733) returns `{ success, stagingStatus }`, but the client types it as `{ success: boolean }` — missing `stagingStatus`.

**Fix:** Align the client types with the actual server response shapes:
```ts
enableStaging: (projectName: string) =>
  request<{ success: boolean; stagingUrl: string; stagingPort: number; stagingStatus: string }>(
    `/gsd/projects/${encodeURIComponent(projectName)}/staging/enable`,
    { method: 'POST' }
  ),

disableStaging: (projectName: string) =>
  request<{ success: boolean; stagingStatus: string }>(
    `/gsd/projects/${encodeURIComponent(projectName)}/staging/disable`,
    { method: 'POST' }
  ),
```

---

### WR-04: `enableStaging` sets `stagingStatus='running'` unconditionally — no health check

**File:** `server/gsd/stagingProvisioner.js:152`

**Issue:** `enableStaging` sets `project.stagingStatus = 'running'` immediately after calling `pm2 restart gsd-tunnel`, without verifying that the tunnel has actually picked up the new ingress rule and that the staging app is reachable. If `pm2 restart gsd-tunnel` succeeds but the tunnel takes several seconds to reload, or if the staging port has no running app behind it, the chip will display a green dot and a live URL that returns errors.

This is a design limitation rather than a crash bug, but it creates a misleading user experience. The `stagingStatus` field on `GsdProject` is described as "live health of staging container — updated by backend polling," implying a future poller will correct this. If that poller is out of scope for this phase, the field should be set to `'unknown'` rather than `'running'` at enable time, matching how the field behaves when absent.

**Fix (minimal):** Change line 152 from:
```js
project.stagingStatus = 'running';
```
to:
```js
project.stagingStatus = 'unknown'; // poller will update once verified reachable
```
Or add a brief HTTP health check against `http://localhost:${port}` after the tunnel restart before marking `running`.

---

## Info

### IN-01: `NewProjectDialog` builds an incomplete `GsdProject` shape with missing required fields

**File:** `client/src/pages/GSD.tsx:1001-1014`

**Issue:** The optimistic `newProject` object created in `NewProjectDialog.handleSubmit` is missing several required fields from the `GsdProject` type: `display_name`, `state`, `roadmap`, `requirements`, `version`, `velocity`, `streak`, `estimatedCompletion`, `tmuxSession`, `sessionState`, `statusText`, `stateEnteredAt`, `sessionCost`, `currentTask`. TypeScript does not flag this because the object is assigned to a locally typed `const`, but passing it to `onCreated` / `setProjects` will cause runtime property access failures in child components that do not guard against `undefined` on those fields (e.g., `project.sessionState ?? "paused"` at line 814 would evaluate to `"paused"` safely, but `project.velocity` or `project.streak` would be `undefined` in the ProjectDetailsPanel).

**Fix:** Add the missing fields with their zero/null defaults, or cast correctly:
```ts
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
  tmuxSession: project.tmux_session ?? null,
  contextTokens: null,
  sessionUpdatedAt: null,
  sessionState: 'working',
  statusText: null,
  stateEnteredAt: null,
  currentTask: null,
  sessionCost: null,
};
```

---

### IN-02: `disableStaging` test reloads module to reset lock — fragile test pattern

**File:** `server/__tests__/provisioning-staging.test.js:147-148` and `238-239`

**Issue:** Several `disableStaging` tests flush the module cache (`delete require.cache[...]`) between an `enableStaging` call and the subsequent `disableStaging` call specifically to reset the `configWriteLock` module-level variable. This means the tests are implicitly documenting a bug: if `enableStaging` and `disableStaging` are called in the same process lifecycle without a module reload, the lock from `enableStaging` may still be unsettled when `disableStaging` begins. In production this is not an issue (separate HTTP request lifecycles), but the test design makes the lock's correctness hard to verify and tightly couples test structure to the module's internal state.

If WR-01 is fixed with the mutex helper pattern, the module reload in tests becomes unnecessary and tests can verify enable→disable in a single require cycle.

**No immediate code change required**, but this is worth noting when addressing WR-01.

---

### IN-03: `console.error` left in production toggle path

**File:** `client/src/pages/GSD.tsx:936`

**Issue:** The staging toggle error handler calls `console.error('Staging toggle failed:', err)`. This is the only `console.error` left in a user-facing action path in this file — other action handlers (archive, pause, reopen-tmux) use `/* silent */`. This is minor inconsistency; the error should surface to the user via a toast or inline message rather than only the browser console.

**Fix:** Either silence the error (matching existing patterns) or add a brief visible error state to the button (matching the SendBox `error` state pattern already in this file). Removing the `console.error` alone is sufficient to align with project style.

---

_Reviewed: 2026-06-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
