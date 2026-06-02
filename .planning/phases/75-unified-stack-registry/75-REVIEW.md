---
phase: 75-unified-stack-registry
reviewed: 2026-06-02T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - server/gsd/provisioning/stackRegistry.js
  - server/gsd/provisioning/sentryProvisioner.js
  - server/gsd/provisioning/umamiProvisioner.js
  - server/gsd/provisioning/stageGates/validateGates.js
  - server/gsd/provisioning/claudeMdInjector.js
  - server/routes/gsd.js
  - server/__tests__/stack-registry.test.js
  - server/__tests__/claude-md-inject.test.js
  - server/__tests__/provisioning.test.js
  - server/__tests__/stage-transitions.test.js
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 75: Code Review Report

**Reviewed:** 2026-06-02
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 75 introduces a unified stack registry, auto-provisioners for Sentry and Umami, stage-gate validation, CLAUDE.md injection, and wiring in the route layer. The overall architecture is clean and the security posture is solid — secrets are never logged, input is sanitised before use in API calls, and the atomic tmp+rename pattern is applied consistently. Test coverage is broad and well-structured.

Four warnings were found: one race condition in `appendEnvKey` that can corrupt the env file under concurrent stage transitions, one duplicate `ALLOWED_TRANSITIONS` definition that creates a maintenance hazard, one missing guard that allows the CLAUDE.md injector to silently write an empty project name into env var names, and one unguarded `keys[0]` access in `sentryProvisioner` that can throw instead of raising a meaningful error. Three info items cover dead code and a test-coverage gap.

---

## Warnings

### WR-01: `appendEnvKey` has no concurrency guard — concurrent stage transitions can interleave writes

**File:** `server/routes/gsd.js:79-101`

**Issue:** `appendEnvKey` reads the env file, modifies lines in memory, writes to a tmp file, and renames it. If two stage transitions happen within milliseconds of each other (e.g. a user double-clicks "Launch"), the second read captures the file before the first write lands, so the first write's change is silently dropped from the second write. The result is a missing `UMAMI_WEBSITE_ID` or `SENTRY_DSN` in the env file.

The `EXDEV` cross-device fallback path (lines 92-96) uses `copyFileSync` + `unlinkSync` as two separate syscalls, which is not atomic — a crash between them leaves a tmp file behind without updating the target. For cross-device scenarios this is unavoidable at the FS level, but the window should be documented.

**Fix:** Serialise env-file writes with an in-process mutex (a simple `Promise` chain is enough for a single-process Node server):

```js
// At module scope in gsd.js
let envWriteLock = Promise.resolve();

async function appendEnvKey(key, value) {
  envWriteLock = envWriteLock.then(async () => {
    const content = fs.readFileSync(ENV_FILE_PATH_PROV, 'utf8');
    // ... existing logic ...
  });
  return envWriteLock;
}
```

---

### WR-02: `ALLOWED_TRANSITIONS` is defined in both `validateGates.js` and `gsd.js` — divergence risk

**File:** `server/routes/gsd.js:105-112` and `server/gsd/provisioning/stageGates/validateGates.js:8-15`

**Issue:** Both files define identical `ALLOWED_TRANSITIONS` Sets. The route already imports `validateGates` from the module — it could trivially import `ALLOWED_TRANSITIONS` from the same module. As written, adding a new transition requires two edits in two files, and missing one silently creates inconsistent behavior (the validate endpoint would allow a transition the PATCH endpoint blocks, or vice versa).

**Fix:** In `server/routes/gsd.js`, remove the local definition and import from the module:

```js
const { validateGates, canTransition, ALLOWED_TRANSITIONS } = require('../gsd/provisioning/stageGates/validateGates');
```

Remove lines 105-112 from `gsd.js`. The `VALID_STAGES` array on line 104 is standalone and unaffected.

---

### WR-03: `injectStackSection` silently emits broken output when `projectName` is empty or undefined

**File:** `server/gsd/provisioning/claudeMdInjector.js:20-70`

**Issue:** If `projectName` is an empty string or `undefined`, the function proceeds without error, writing env var names like `_UMAMI_WEBSITE_ID` and bucket refs like `gsd-` into the CLAUDE.md file. The call site in `gsd.js` (line 620) passes `project.name`, which is always present at that point, but the function itself has no guard — it is a public export and future callers may not guarantee a non-empty name.

**Fix:** Add a guard at the top of `injectStackSection`:

```js
function injectStackSection(claudeMdPath, projectName) {
  if (!projectName || typeof projectName !== 'string' || projectName.trim() === '') {
    console.warn('[claudeMdInjector] projectName is required — skipping');
    return;
  }
  // ... existing code ...
}
```

---

### WR-04: `sentryProvisioner.createProject` — `keys[0]` access has no length check, throws unclear error

**File:** `server/gsd/provisioning/sentryProvisioner.js:56-57`

**Issue:** After the keys fetch succeeds (`keysResp.ok`), the code accesses `keys[0]?.dsn?.public`. If `keys` is not an array (e.g. Sentry returns an unexpected shape such as `{ results: [] }`), the optional chaining silently evaluates to `undefined`, and the subsequent guard on line 57 throws `'Sentry project created but no DSN found in client keys'` — but does not include any detail about what was actually returned. This makes production debugging difficult.

Additionally, if `keys` is not an array at all, `keys[0]` evaluates to `undefined` rather than throwing — the existing guard catches it, but the error message loses the actual response shape.

**Fix:** Validate that `keys` is an array before accessing index 0:

```js
if (!Array.isArray(keys) || keys.length === 0) {
  throw new Error(`Sentry keys endpoint returned unexpected shape: ${JSON.stringify(keys).slice(0, 200)}`);
}
const dsn = keys[0]?.dsn?.public;
if (!dsn) throw new Error('Sentry project created but no DSN found in client keys');
```

---

## Info

### IN-01: Stub comment left in the validate endpoint (`// Real gate validation injected by Plan 02`)

**File:** `server/routes/gsd.js:685`

**Issue:** The comment on line 685 says "for now return permissive stub" and references Plan 02. The real `validateGates` is now in place (lines 688-690), but the surrounding comment and the try/catch that silently swallows a missing module are dead code. The `catch` block at line 691 is unreachable in production — if the module fails to load, the `require` at line 688 will throw synchronously and would surface as a 500 error anyway.

**Fix:** Remove the dead comment and the catch block, making the call direct:

```js
const { validateGates } = require('../gsd/provisioning/stageGates/validateGates');
const gateResult = await validateGates(project, targetStage);
res.json(gateResult);
```

---

### IN-02: `stackRegistry.js` `provisionerModule` paths are not validated at startup

**File:** `server/gsd/provisioning/stackRegistry.js:39-121`

**Issue:** The registry declares `provisionerModule` as relative require paths (e.g. `'./betterStackProvisioner'`), but nothing in the registry or its consumers validates that those modules actually exist at startup. A typo in a module path would be discovered only when a `beta->launched` transition is attempted in production. This is low-severity because the paths are static strings checked at code-review time, but a startup check would surface mistakes earlier.

**Fix (optional):** Add a self-check at the bottom of `stackRegistry.js` that is only active in non-production environments:

```js
if (process.env.NODE_ENV !== 'production') {
  for (const svc of SERVICES) {
    if (svc.provisionerModule) {
      require(svc.provisionerModule); // throws on bad path at startup
    }
  }
}
```

---

### IN-03: `stage-transitions.test.js` EXEC-01 does not assert that env keys were written

**File:** `server/__tests__/stage-transitions.test.js:109-171`

**Issue:** EXEC-01 verifies that the provisioner is called and the stage transitions, but does not assert that `appendEnvKey` was called (i.e. that the returned `monitorId` or `websiteId` was persisted to `.env.production`). If the env-write path is accidentally bypassed, the test still passes. Since `appendEnvKey` writes to a hardcoded production path, integration-testing it is non-trivial, but the mock setup could at least verify the write path was exercised by injecting a spy.

**Fix (suggestion):** This is low-priority given the test already covers the provisioner call. A future improvement would inject a testable `appendEnvKey` function through a dependency injection point similar to how `_testPauseSession` works.

---

_Reviewed: 2026-06-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
