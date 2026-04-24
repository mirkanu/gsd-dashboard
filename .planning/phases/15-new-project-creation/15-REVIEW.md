---
phase: 15-new-project-creation
reviewed: 2026-04-24T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - client/src/lib/api.ts
  - client/src/pages/GSD.tsx
  - server/routes/gsd.js
  - server/__tests__/api.test.js
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-04-24
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed four files covering the new-project-creation feature: the server route handler (`server/routes/gsd.js`), the main GSD page component (`client/src/pages/GSD.tsx`), the API client (`client/src/lib/api.ts`), and the test suite (`server/__tests__/api.test.js`).

`api.ts` is clean — well-typed, consistent, no issues found.

The `POST /api/gsd/projects/create` route in `gsd.js` has a path traversal vulnerability via the `basePath` parameter. Three additional warnings were found in the same file. The React component has one warning and one info item. The test file has one minor info item.

---

## Critical Issues

### CR-01: Path traversal via unconstrained `basePath` parameter

**File:** `server/routes/gsd.js:519-524`
**Issue:** The `POST /api/gsd/projects/create` endpoint accepts a `basePath` field from the request body and uses it directly with `path.join()` after only checking `path.isAbsolute()`. This allows any caller to pass an arbitrary absolute path (e.g. `/etc`, `/root`, `/home`) as the base directory. The server will then create a subdirectory there and persist it to `gsd-projects.json`. The `isAbsolute` check is not a security boundary — it only validates path format, not whether the path is within an allowed location.

**Fix:** Restrict `basePath` to an allowlist of permitted roots, or remove the parameter entirely and always default to `/data/home`:

```js
// Option A: remove basePath from the API entirely — it is not needed for the dashboard use case
const resolvedBase = '/data/home';
const dir = path.join(resolvedBase, name);

// Option B: if basePath must remain, validate against an explicit allowlist
const ALLOWED_BASES = ['/data/home'];
const resolvedBase =
  basePath && typeof basePath === 'string' && ALLOWED_BASES.includes(basePath)
    ? basePath
    : '/data/home';
```

---

## Warnings

### WR-01: Race condition in `/projects/create` config update allows duplicate entries

**File:** `server/routes/gsd.js:527-574`
**Issue:** The duplicate check (line 534) reads from an earlier `config` variable loaded at line 529. The final write (lines 567-574) performs a fresh re-read before appending — which is correct for picking up concurrent writes — but the duplicate check and the re-read+append are not atomic. Two concurrent `create` requests for the same name can both pass the duplicate check (line 534) before either write completes, resulting in the same project appearing twice in `gsd-projects.json`. The re-read at line 569 only helps if another *different* project was added between the two reads, not if the same name is being raced.

**Fix:** Move the duplicate check to the fresh re-read, immediately before the append:

```js
// Re-read to pick up any writes since we first loaded
const freshConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
// Re-check for duplicates on the freshly read config
if (freshConfig.projects.find((p) => p.name === name)) {
  return res.status(409).json({ error: 'project already exists' });
}
freshConfig.projects.push(newEntry);
fs.writeFileSync(configPath, JSON.stringify(freshConfig, null, 2) + '\n', 'utf8');
```

### WR-02: `stateEnteredAt` resets to current time on cold snapshot, producing incorrect elapsed display

**File:** `server/routes/gsd.js:155-159`
**Issue:** When no broadcaster snapshot exists for a project (server restart, first poll after project creation, or a state mismatch), `stateEnteredAt` is set to `new Date().toISOString()` — i.e., right now. This means the UI will always show "0s ago" or similar for any project whose snapshot is stale, regardless of how long it has actually been in the current state. This is silently incorrect data rather than an honest "unknown".

**Fix:** Return `null` when the snapshot is absent, and let the UI handle it:

```js
const stateEnteredAt =
  snap && snap.sessionState === sessionState
    ? snap.stateEnteredAt
    : null; // unknown — do not invent a timestamp
```

The `ProjectCard` already conditionally renders the elapsed label only when `project.stateEnteredAt` is truthy (`GSD.tsx:792`), so returning `null` here is safe and will simply hide the label instead of showing "0s".

### WR-03: `require('child_process')` called inside route handlers at runtime

**File:** `server/routes/gsd.js:303, 350, 409, 546`
**Issue:** `require('child_process')` is called inside four separate route handler functions rather than at the top of the module. While Node.js caches module requires and this does not cause a functional bug, it obscures the module's dependencies, makes the code inconsistent with the top-of-file `require` pattern used for all other dependencies, and would surface a startup error only when the relevant route is first called rather than at server boot.

**Fix:** Hoist to the top of the file alongside the other requires:

```js
// At top of file, with other requires:
const { execFileSync, spawnSync } = require('child_process');
```

Then remove the four inline `require('child_process')` calls within the handlers.

---

## Info

### IN-01: `SendBox` calls `window.matchMedia` directly in function body

**File:** `client/src/pages/GSD.tsx:131`
**Issue:** `const isMobile = window.matchMedia('(pointer: coarse)').matches` is evaluated directly inside the `SendBox` render function body on every render without `useState` or `useMemo`. The project already has a `useMediaQuery` hook defined at line 29 for exactly this purpose. While harmless in this client-only SPA, it diverges from the established pattern used in `TerminalOverlay` (`useState(() => window.matchMedia(...).matches)` at line 308) and `ProjectCard` (inline `window.matchMedia` checks). The inconsistency is minor but does mean `SendBox` won't reactively update if device capability changes (e.g., connecting a mouse on a tablet).

**Fix:** Either use the existing hook or the `useState` initializer pattern:

```tsx
// Option A: use the existing hook (reactive):
const isMobile = useMediaQuery('(pointer: coarse)');

// Option B: stable one-time check matching TerminalOverlay pattern:
const [isMobile] = useState(() => window.matchMedia('(pointer: coarse)').matches);
```

### IN-02: Test teardown uses forced `process.exit` to work around open handles

**File:** `server/__tests__/api.test.js:65-77`
**Issue:** The `after()` hook calls `server.close()` without a callback and then uses `setTimeout(() => process.exit(0), 100)` to force process exit because the WebSocket heartbeat interval keeps the process alive. The forced exit bypasses any remaining async teardown, and `server.close()` is fire-and-forget — open connections may not be fully drained before exit. This is a known test smell and can occasionally mask cleanup-phase errors.

**Fix:** Expose the WS heartbeat interval from `server/index.js` so it can be cleared in the teardown, allowing the process to exit cleanly:

```js
// In server/index.js: export the heartbeat interval ref
// In after():
after(async () => {
  clearInterval(wsHeartbeatInterval); // clear the WS keepalive
  await new Promise((resolve) => server.close(resolve));
  if (db) db.close();
  // ... cleanup temp files
});
```

---

_Reviewed: 2026-04-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
