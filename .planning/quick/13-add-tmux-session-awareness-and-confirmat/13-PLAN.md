---
phase: quick-13
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/autopilot/AutopilotManager.js
  - server/routes/autopilot.js
  - client/src/lib/types.ts
  - client/src/lib/api.ts
  - client/src/pages/GSD.tsx
autonomous: true
requirements: [QUICK-13]
must_haves:
  truths:
    - "Before each phase spawn, AutopilotManager broadcasts pending_confirmation and pauses its tick loop"
    - "User sees an inline confirmation UI on the project card with the pending command and Confirm/Cancel buttons"
    - "Clicking Confirm calls POST /api/autopilot/confirm, which unblocks the manager and queues command delivery"
    - "If the session is busy (working), the backend waits up to 5 minutes for idle; status broadcasts as queued"
    - "If 5-minute queue timeout expires, status broadcasts as queue_timeout and the run stops for that phase"
    - "Clicking Pause/Cancel while pending_confirmation or queued aborts the pending command via existing pause mechanism"
  artifacts:
    - path: "server/autopilot/AutopilotManager.js"
      provides: "_pendingConfirmation flag, _requestConfirmation(), confirmSpawn() method"
    - path: "server/routes/autopilot.js"
      provides: "POST /api/autopilot/confirm endpoint"
    - path: "client/src/lib/types.ts"
      provides: "pending_confirmation | queued | queue_timeout added to AutopilotRunStatus and AutopilotProgressEvent"
    - path: "client/src/pages/GSD.tsx"
      provides: "AutopilotControls renders confirmation UI with command preview + Confirm/Cancel"
  key_links:
    - from: "AutopilotManager._spawnPhase()"
      to: "broadcast pending_confirmation + set _pendingConfirmation flag"
      via: "_requestConfirmation() replaces direct spawn call"
    - from: "POST /api/autopilot/confirm"
      to: "AutopilotManager.confirmSpawn()"
      via: "runRegistry lookup by projectName"
    - from: "client AutopilotControls"
      to: "POST /api/autopilot/confirm"
      via: "api.autopilot.confirm(projectName)"
---

<objective>
Add tmux session awareness and user confirmation to autopilot command delivery.

Purpose: Autopilot is "assisted autopilot" — user confirms each phase command before it fires. If the session is busy, the command queues until idle (up to 5 minutes).
Output: pending_confirmation status, inline card UI, POST /api/autopilot/confirm route, queue_timeout handling.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/13-add-tmux-session-awareness-and-confirmat/13-CONTEXT.md

<interfaces>
<!-- Key existing interfaces the executor needs. -->

From server/autopilot/AutopilotManager.js:
- Constructor injects: db, spawnFn, broadcastFn, readStateFn, pollMs, maxPhaseMs, circuitBreakerFactory
- _spawnPhase(phaseNum): sets _phaseSpawned=true, broadcasts 'started', calls this._spawnFn(...)
- _tick(): calls _spawnPhase() when !this._phaseSpawned
- _handlePhaseFailure(): calls this._spawnFn(...) directly for retry
- broadcastFn signature: broadcastFn(eventType, { projectName, phaseNum, status, runId })
- pause(): sets this.paused = true, updates DB
- stop(): clears interval, sets _stopped = true

From server/routes/autopilot.js:
- runRegistry: Map<projectName, { manager, runId }>
- proxyIfRemote(req, res, upstreamPath): proxies to GSD_DATA_URL if set
- Existing routes follow pattern: check projectName, lookup runRegistry, call manager method

From server/gsd/tmux.js:
- waitForIdle(sessionName, timeoutMs): Promise<void>, rejects on timeout
- detectSessionState(sessionName): 'archived'|'waiting'|'paused'|'working'
- _testWaitForIdle(detectFn, sessionName, timeoutMs): injectable test hook

From client/src/lib/types.ts:
- AutopilotRunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'idle' | 'halted'
- AutopilotProgressEvent.status = 'planning' | 'executing' | 'completed' | 'failed' | 'halted'
- AutopilotRun: { runId, status: AutopilotRunStatus, currentPhaseNum, projectName }

From client/src/pages/GSD.tsx AutopilotControls:
- Receives: { project: GsdProject, autopilotRun: AutopilotRun | null }
- status = autopilotRun?.status ?? 'idle'
- Shows buttons based on status: idle/completed/failed → Plan All + Run Autopilot, running → Pause, paused → Resume
- eventBus.subscribe('autopilot_progress', handler) pattern is used in the parent GSD page
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add confirmation flow to AutopilotManager + confirm route</name>
  <files>server/autopilot/AutopilotManager.js, server/routes/autopilot.js</files>
  <action>
**AutopilotManager changes:**

1. Add to constructor: `this._pendingConfirmation = false;` and `this._pendingCommand = null;`

2. Replace the direct spawn call in `_spawnPhase(phaseNum)` with a call to `_requestConfirmation(phaseNum)`:
   ```js
   _spawnPhase(phaseNum) {
     this._phaseSpawned = true;
     this._requestConfirmation(phaseNum);
   }
   ```

3. Add `_requestConfirmation(phaseNum)`:
   - Set `this._pendingConfirmation = true`
   - Store `this._pendingCommand = { phaseNum }`
   - Broadcast `autopilot_progress` with `status: 'pending_confirmation'` and include `pendingCommand: '/gsd:execute-phase ' + phaseNum` in the payload
   - The tick loop's `if (this._stopped || this.paused)` guard already blocks — BUT `pending_confirmation` must also block spawning. Ensure `_tick()` returns early when `this._pendingConfirmation` is true (add guard at top of _tick after paused/stopped check).

4. Add `confirmSpawn()` public method:
   - If `!this._pendingConfirmation`, return early (no-op, idempotent)
   - Set `this._pendingConfirmation = false`
   - Capture `phaseNum = this._pendingCommand?.phaseNum`
   - Clear `this._pendingCommand = null`
   - Broadcast `autopilot_progress` with `status: 'queued'` and the phaseNum
   - Start actual spawn: call the original spawn logic (extracted into a private `_doSpawn(phaseNum)` helper):
     ```js
     _doSpawn(phaseNum) {
       this._broadcastFn('autopilot_progress', {
         projectName: this._projectName,
         phaseNum,
         status: 'started',
         runId: this._runId,
       });
       const result = this._spawnFn(this._projectName, '/gsd:execute-phase', {
         args: [`${phaseNum}`],
         runId: this._runId,
         db: this._db,
       });
       if (result && typeof result.then === 'function') {
         result.catch(() => { this._phaseSpawned = false; });
       }
     }
     ```
   - The `confirmSpawn()` method calls `_doSpawn(phaseNum)`. No session-state check here — processSpawner's `waitForIdle` (15s) already handles brief busy states. The 5-minute queue is handled by broadcasting `queued` status, and the existing `waitForIdle` in processSpawner covers the wait. If processSpawner rejects (timeout), `_phaseSpawned` resets to false and `_pendingConfirmation` stays false — next tick will call `_requestConfirmation` again.
   - For the 5-minute "queue timeout" scenario: extend `waitForIdle` timeout passed to spawnFn by overriding via a `queueTimeoutMs` option. Actually: keep it simpler per the context decision — processSpawner already calls `waitForIdle(session, 15000)`. For "queue" mode, we need a 5-minute wait. Pass a `waitTimeoutMs` option from `confirmSpawn` to `_spawnFn`: `this._spawnFn(this._projectName, '/gsd:execute-phase', { args: [...], runId, db: this._db, waitTimeoutMs: 300000 })`. Update processSpawner to use `options.waitTimeoutMs || 15000` instead of hardcoded 15000. If the 5-minute waitForIdle rejects, the `_phaseSpawned = false` reset fires, and on next tick `_requestConfirmation` is called again — BUT we should broadcast `queue_timeout` and stop instead. So in `confirmSpawn()`, attach a catch to the spawn result that checks if the error message contains "Timeout waiting for idle" and if so: broadcasts `queue_timeout` status, calls `this._handlePhaseFailure(phaseNum, 'Queue timeout: session busy for 5 minutes')`.

5. Reset `_pendingConfirmation = false` and `_pendingCommand = null` in `stop()` and `_halt()` cleanup, and in `_onPhaseCompleted()` (in case confirmSpawn fires after phase already advanced — defensive).

6. Also reset in `resume()` (already resets retry state, add pendingConfirmation reset there too).

**Route change (server/routes/autopilot.js):**

Add `POST /api/autopilot/confirm` endpoint after the resume route:
```js
router.post('/confirm', (req, res) => {
  if (GSD_DATA_URL) return proxyIfRemote(req, res, '/api/autopilot/confirm');
  const { projectName } = req.body || {};
  if (!projectName || typeof projectName !== 'string') {
    return res.status(400).json({ error: 'projectName is required' });
  }
  const entry = runRegistry.get(projectName);
  if (!entry) {
    return res.status(404).json({ error: `No active run found for project: ${projectName}` });
  }
  try {
    entry.manager.confirmSpawn();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

Also update `processSpawner.js` — change line 46: `await waitForIdleFn(project.tmux_session, 15000)` to `await waitForIdleFn(project.tmux_session, options.waitTimeoutMs || 15000)`.
  </action>
  <verify>
    <automated>npm run test:server 2>&1 | tail -20</automated>
  </verify>
  <done>AutopilotManager broadcasts pending_confirmation before each spawn, pauses tick loop until confirmSpawn() is called, confirmSpawn triggers actual spawn with 5-min waitForIdle timeout and handles queue_timeout on failure. POST /api/autopilot/confirm route exists and proxies correctly.</done>
</task>

<task type="auto">
  <name>Task 2: Update client types, api, and AutopilotControls confirmation UI</name>
  <files>client/src/lib/types.ts, client/src/lib/api.ts, client/src/pages/GSD.tsx</files>
  <action>
**client/src/lib/types.ts:**

1. Extend `AutopilotRunStatus` to include new statuses:
   ```ts
   export type AutopilotRunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'idle' | 'halted' | 'pending_confirmation' | 'queued' | 'queue_timeout';
   ```

2. Extend `AutopilotProgressEvent.status`:
   ```ts
   status: 'planning' | 'executing' | 'completed' | 'failed' | 'halted' | 'pending_confirmation' | 'queued' | 'queue_timeout' | 'started' | 'retrying';
   ```
   (Add 'started' and 'retrying' which are already broadcast but missing from the union.)

3. Add optional `pendingCommand` field to `AutopilotProgressEvent`:
   ```ts
   pendingCommand?: string;
   ```

**client/src/lib/api.ts:**

Add `confirm` method to `api.autopilot`:
```ts
confirm: (projectName: string) =>
  request<{ ok: boolean }>('/autopilot/confirm', {
    method: 'POST',
    body: JSON.stringify({ projectName }),
  }),
```

**client/src/pages/GSD.tsx:**

In `AutopilotControls` component:

1. Add state for the pending command label:
   ```tsx
   const [pendingCommand, setPendingCommand] = useState<string | null>(null);
   ```

2. Subscribe to `autopilot_progress` WS events to capture `pendingCommand` from the payload. Use `eventBus` (already imported via parent, or import directly — check existing pattern: `eventBus` is imported in parent via `../lib/eventBus`, AutopilotControls is a child component so it can import it directly too):
   ```tsx
   useEffect(() => {
     const unsub = eventBus.subscribe('autopilot_progress', (msg: { data: AutopilotProgressEvent }) => {
       const evt = msg.data;
       if (evt.projectName !== project.name) return;
       if (evt.status === 'pending_confirmation' && evt.pendingCommand) {
         setPendingCommand(evt.pendingCommand);
       } else if (evt.status !== 'pending_confirmation') {
         setPendingCommand(null);
       }
     });
     return unsub;
   }, [project.name]);
   ```

3. Add `handleConfirm` handler:
   ```tsx
   const handleConfirm = async (e: React.MouseEvent) => {
     e.stopPropagation();
     if (busy) return;
     setBusy(true);
     try { await api.autopilot.confirm(project.name); }
     catch (err) { showError(err); }
     finally { setBusy(false); }
   };
   ```

4. Add `handleCancel` (calls pause):
   ```tsx
   const handleCancel = async (e: React.MouseEvent) => {
     e.stopPropagation();
     if (busy) return;
     setBusy(true);
     try { await api.autopilot.pause(project.name); }
     catch (err) { showError(err); }
     finally { setBusy(false); }
   };
   ```

5. Update the JSX in `AutopilotControls` return to add `pending_confirmation` and `queued` rendering:

   In the status-based button logic, add cases:
   - When `status === 'pending_confirmation'`: show the confirmation UI block instead of Run Autopilot
   - When `status === 'queued'`: show "Queued — waiting for idle…" with a Cancel button
   - When `status === 'queue_timeout'`: show "Queue timeout" in red (treat like failed for buttons)

   Add to the status indicator block below buttons:
   ```tsx
   {status === 'queue_timeout' && (
     <span className="text-[10px] text-red-400">Queue timeout — session was busy</span>
   )}
   {status === 'queued' && (
     <span className="text-[10px] text-amber-400 animate-pulse">Queued — waiting for idle…</span>
   )}
   ```

   Confirmation UI block (shown when `status === 'pending_confirmation'`):
   ```tsx
   {status === 'pending_confirmation' && (
     <div className="w-full flex flex-col gap-1.5 py-1">
       <p className="text-[10px] text-gray-400">
         Ready to send: <span className="font-mono text-accent">{pendingCommand ?? '/gsd:execute-phase'}</span>
       </p>
       <div className="flex gap-2">
         <button
           onClick={handleConfirm}
           disabled={busy}
           className="text-[10px] px-2.5 py-1 rounded border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
         >
           {busy ? '…' : 'Confirm'}
         </button>
         <button
           onClick={handleCancel}
           disabled={busy}
           className="text-[10px] px-2.5 py-1 rounded border border-border text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-40"
         >
           Cancel
         </button>
       </div>
     </div>
   )}
   ```

   For the existing `(status === 'idle' || status === 'completed' || status === 'failed')` checks, add `'queue_timeout'` to those conditions so buttons reappear after a timeout.

   The `queued` status should show Pause button — add `|| status === 'queued'` to the running Pause button condition.

   Also update the autopilot_progress WS message mapping in the parent GSD component: find where `planning`/`executing` are mapped to `running` in client AutopilotControls and add `pending_confirmation`, `queued`, `queue_timeout` pass-through (they should NOT be mapped to 'running'). Look for the existing mapping logic in the parent page's `autopilotRuns` state update handler and preserve `pending_confirmation`, `queued`, `queue_timeout` as-is when setting run status.
  </action>
  <verify>
    <automated>npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>Types include new statuses. api.autopilot.confirm() exists. AutopilotControls shows inline confirmation UI when status is pending_confirmation, queued status with Cancel, queue_timeout treated like failed. eventBus subscription updates pendingCommand label.</done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `npm run test:server` passes
2. `npm run test:client` passes
3. TypeScript: `cd /data/home/gsddashboard/client && npx tsc --noEmit 2>&1 | head -20` — no new errors
4. `npm run build` succeeds (verifies client + server compile together)
</verification>

<success_criteria>
- AutopilotManager tick loop pauses at each phase spawn, broadcasts pending_confirmation with command preview
- POST /api/autopilot/confirm unblocks the manager and triggers spawn with 5-min queue timeout
- Queue timeout broadcasts queue_timeout and stops the run via _handlePhaseFailure
- Dashboard card shows pending command + Confirm/Cancel buttons when status is pending_confirmation
- Queued status shows "waiting for idle" with Cancel button
- All existing tests pass, no TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/13-add-tmux-session-awareness-and-confirmat/13-SUMMARY.md`
</output>
