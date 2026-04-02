---
phase: quick-12
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/gsd/tmux.js
  - server/autopilot/processSpawner.js
  - server/__tests__/tmux.test.js
  - server/__tests__/processSpawner.test.js
  - client/src/pages/GSD.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Autopilot only sends tmux send-keys when the Claude Code ❯ prompt is visible (session is idle)"
    - "If the session does not become idle within the timeout, spawnGsdCommand returns an error instead of blindly typing into an active session"
    - "Failed autopilot API calls (planAll, start, pause, resume) show an error toast in the UI instead of silently swallowing"
  artifacts:
    - path: "server/gsd/tmux.js"
      provides: "waitForIdle(sessionName, timeoutMs) — polls capture-pane for ❯ prompt"
      exports: ["waitForIdle"]
    - path: "server/autopilot/processSpawner.js"
      provides: "calls waitForIdle before tmux send-keys"
    - path: "client/src/pages/GSD.tsx"
      provides: "AutopilotControls handlers use toast.error() on catch"
  key_links:
    - from: "server/autopilot/processSpawner.js"
      to: "server/gsd/tmux.js waitForIdle"
      via: "require + async call before send-keys"
    - from: "client/src/pages/GSD.tsx AutopilotControls"
      to: "toast notification"
      via: "inline toast helper (no external dep)"
---

<objective>
Fix two gaps that prevent autopilot from working end-to-end:

1. **Command delivery** — `processSpawner.spawnGsdCommand` blindly fires `tmux send-keys` even when Claude Code is mid-operation. This types text into an active session where it cannot be processed. Fix: add `waitForIdle(sessionName, timeoutMs)` to `tmux.js` that polls `capture-pane` for the `❯` prompt (idle indicator), then make `spawnGsdCommand` async and await this before sending keys.

2. **Silent error swallowing** — All four autopilot button handlers in `AutopilotControls` have `catch { /* silent */ }`. Users see nothing when API calls fail. Fix: show an inline error toast using a lightweight local `showToast` helper (no new npm dependency — just a short-lived DOM element or a simple React state approach).

Purpose: Without (1), autopilot commands are never processed. Without (2), users have no idea when autopilot operations fail.
Output: Updated server/gsd/tmux.js, server/autopilot/processSpawner.js, client/src/pages/GSD.tsx.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/25-autopilot-core/.continue-here.md

<interfaces>
<!-- Key types and contracts the executor needs. -->

From server/gsd/tmux.js (current exports):
```javascript
module.exports = {
  isTmuxSessionActive,  // (sessionName) → boolean
  capturePaneText,       // (sessionName) → string|null — calls: tmux capture-pane -p -t {session}
  detectSessionState,    // (sessionName) → 'archived'|'waiting'|'paused'|'working'
  detectRateLimit,       // (sessionNames[]) → { active, resetAt }
  _testDetectFromOutput  // (output) → 'working'|'waiting' — test hook, no tmux calls
};
```

The ❯ prompt pattern (Claude Code idle indicator):
- Claude Code shows `❯` when idle and ready for input
- `capturePaneText(sessionName)` returns the last N lines of terminal output
- `detectSessionState()` returns 'working' when timer patterns are present, 'waiting' otherwise
- Use `detectSessionState()` to check for idle — if it returns 'waiting' (not 'working'), the session is ready

From server/autopilot/processSpawner.js (current spawnGsdCommand signature):
```javascript
// Currently synchronous
function spawnGsdCommand(projectName, gsdCommand, options = {}) {
  const { args = [], runId = null, spawnFn = spawn, db = null } = options;
  // ... inserts registry record, then:
  spawnFn('tmux', ['send-keys', '-t', project.tmux_session, fullCommand, 'Enter'], { ... })
}
module.exports = { spawnGsdCommand };
```

From server/autopilot/AutopilotManager.js (_spawnPhase method):
```javascript
_spawnPhase(phaseNum) {
  this._phaseSpawned = true;
  this._broadcastFn('autopilot_progress', { ... });
  this._spawnFn(this._projectName, '/gsd:execute-phase', {
    args: [`${phaseNum}`],
    runId: this._runId,
    db: this._db,
  });
}
```
Note: AutopilotManager._spawnFn is injected. The real production spawnFn is processSpawner.spawnGsdCommand.
The _tick() loop calls _spawnPhase() synchronously. If spawnGsdCommand becomes async, _spawnPhase needs to await it and set _phaseSpawned=true only after the wait succeeds.

From client/src/pages/GSD.tsx (AutopilotControls — the four silent catch blocks):
```typescript
const handlePlanAll = async (e: React.MouseEvent) => {
  // ...
  try { await api.autopilot.planAll(project.name); }
  catch { /* silent */ }
  finally { setBusy(false); }
};
// Same pattern for handleStart, handlePause, handleResume
```
The component already has: useState, useEffect, react imports.
No sonner/toast library is installed. Use a local error state approach:
- Add `const [error, setError] = useState<string | null>(null)` to AutopilotControls
- In catch blocks: `setError(err instanceof Error ? err.message : 'Request failed')`
- Auto-clear error after 4 seconds with setTimeout
- Render error inline: `{error && <p className="text-xs text-red-400 mt-1 w-full">{error}</p>}`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add waitForIdle to tmux.js and make spawnGsdCommand async</name>
  <files>server/gsd/tmux.js, server/autopilot/processSpawner.js, server/__tests__/tmux.test.js, server/__tests__/processSpawner.test.js</files>
  <behavior>
    - waitForIdle('idle-session', 3000): session returns 'waiting' from detectSessionState on first poll → resolves immediately
    - waitForIdle('busy-session', 3000): session returns 'working' for 2 polls then 'waiting' → resolves after delay
    - waitForIdle('busy-session', 100): session never returns 'waiting' within 100ms → rejects with Error('Timeout waiting for idle session: busy-session')
    - waitForIdle(null, 3000): returns immediately (no session configured → skip wait)
    - spawnGsdCommand: when waitForIdle resolves, the tmux send-keys spawn still fires (existing registry+spawn behavior preserved)
    - spawnGsdCommand: when waitForIdle rejects (timeout), update process_registry exit_code=-2 and throw/reject
  </behavior>
  <action>
**In server/gsd/tmux.js:**

Add `waitForIdle(sessionName, timeoutMs = 15000)` function after the existing exports:
- If `!sessionName`, return resolved Promise immediately (no session = skip wait)
- Poll `detectSessionState(sessionName)` every 1000ms
- If state is NOT 'working' (i.e., 'waiting', 'paused', 'archived'), resolve immediately
- If state IS 'working', wait 1000ms and retry
- If `timeoutMs` elapsed without resolution, reject with `new Error(\`Timeout waiting for idle session: \${sessionName}\`)`
- Use a polling loop with `setTimeout` inside a Promise (not `setInterval` — cleaner cancel)
- Export `waitForIdle` in `module.exports`

**In server/autopilot/processSpawner.js:**

Make `spawnGsdCommand` async:
1. Import `waitForIdle` from `../gsd/tmux`
2. Add `waitForIdleFn` to injectable options: `const { args = [], runId = null, spawnFn = spawn, db = null, waitForIdleFn = waitForIdle } = options`
3. After getting `project.tmux_session`, call `await waitForIdleFn(project.tmux_session, 15000)` — wrap in try/catch; on error, update process_registry with `exit_code = -2, ended_at = now` and re-throw
4. Proceed with existing send-keys logic unchanged after successful wait

**Test updates:**
- In `server/__tests__/tmux.test.js`: add test `'waitForIdle: resolves immediately when session is not working'` using `_testDetectFromOutput`-style logic. Since `waitForIdle` calls `detectSessionState` which calls real tmux, inject a `detectFn` param for tests OR use the _testWaitForIdle hook pattern from Phase 24. Simplest: export `_testWaitForIdle(detectFn, sessionName, timeoutMs)` that accepts an injectable detectFn, same as `_testDetectFromOutput` pattern.
- In `server/__tests__/processSpawner.test.js`: add test verifying that when `waitForIdleFn` resolves, the spawn proceeds; add test that when `waitForIdleFn` rejects, the registry is updated with exit_code=-2 and the error propagates.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -30</automated>
  </verify>
  <done>
    All existing server tests pass. New waitForIdle tests pass (immediate resolve, timeout reject). spawnGsdCommand tests cover both wait-succeeds and wait-timeout paths. `waitForIdle` exported from tmux.js.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix silent catch blocks in AutopilotControls with inline error state</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
In the `AutopilotControls` component (around line 590):

1. Add error state: `const [error, setError] = useState<string | null>(null)`

2. Create a helper inside the component:
```typescript
const showError = (err: unknown) => {
  const msg = err instanceof Error ? err.message : 'Request failed';
  setError(msg);
  setTimeout(() => setError(null), 4000);
};
```

3. Replace all four `catch { /* silent */ }` blocks:
   - `handlePlanAll`: `catch (err) { showError(err); }`
   - `handleStart`: `catch (err) { showError(err); }`
   - `handlePause`: `catch (err) { showError(err); }`
   - `handleResume`: `catch (err) { showError(err); }`

4. In the returned JSX, inside the wrapping `<div className="px-4 pb-3 pt-1 flex flex-wrap items-center gap-2">`, add after the existing buttons:
```tsx
{error && (
  <p className="text-xs text-red-400 w-full mt-1 truncate" title={error}>
    {error}
  </p>
)}
```

Do NOT change any other catch blocks in GSD.tsx (the clipboard paste, archive/unarchive, and reopen-tmux catches are intentionally silent and should stay that way).
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>
    Client tests pass. AutopilotControls renders an error message below the buttons when any API call throws. Error auto-clears after 4 seconds. No new npm packages added.
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. `npm run test:server` — all tests pass including new waitForIdle tests
2. `npm run test:client` — all tests pass
3. Manual check: `grep -n "catch { /\* silent \*/" client/src/pages/GSD.tsx` — should return 0 matches in AutopilotControls (lines 600-633 range), only the intentionally-silent ones remain elsewhere
4. Manual check: `grep -n "waitForIdle" server/gsd/tmux.js server/autopilot/processSpawner.js` — confirms both files have the integration
</verification>

<success_criteria>
- `waitForIdle` exported from `server/gsd/tmux.js`, polls detectSessionState, rejects on timeout
- `spawnGsdCommand` awaits `waitForIdle` before sending keys; updates registry with exit_code=-2 on timeout
- AutopilotControls shows inline `text-red-400` error message on API failure, auto-clears after 4s
- All server and client tests pass
- No new npm dependencies added
</success_criteria>

<output>
After completion, create `.planning/quick/12-fix-autopilot-command-delivery-waitforid/12-SUMMARY.md`
</output>
