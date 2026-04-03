---
phase: quick-14
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/autopilot/AutopilotManager.js
  - server/__tests__/autopilotManager.test.js
autonomous: true
requirements: [QUICK-14]
must_haves:
  truths:
    - "Plan All button triggers /gsd:plan-phase N in the tmux session, not /gsd:execute-phase N"
    - "Run Autopilot button continues to trigger /gsd:execute-phase N"
    - "pending_confirmation broadcast shows the correct command string for each runType"
  artifacts:
    - path: "server/autopilot/AutopilotManager.js"
      provides: "runType stored and used to select correct GSD command"
      contains: "_runType"
    - path: "server/__tests__/autopilotManager.test.js"
      provides: "test coverage for plan-all runType"
  key_links:
    - from: "autopilot.js plan-all route"
      to: "AutopilotManager.start()"
      via: "runType: 'plan-all' option"
      pattern: "runType.*plan-all"
    - from: "AutopilotManager._requestConfirmation"
      to: "pendingCommand broadcast"
      via: "_gsdCommand() helper"
      pattern: "_gsdCommand"
    - from: "AutopilotManager._doSpawn"
      to: "spawnFn call"
      via: "_gsdCommand() helper"
      pattern: "_gsdCommand"
---

<objective>
Fix AutopilotManager so it honors the runType option passed from the plan-all route.
Currently the manager ignores runType entirely and always spawns /gsd:execute-phase N.

Purpose: Plan All button must issue /gsd:plan-phase N (planning only, no execution) while
Run Autopilot continues to issue /gsd:execute-phase N. The pendingCommand broadcast shown
in the UI confirmation dialog must also reflect the correct command.

Output: Updated AutopilotManager.js storing _runType and using it in all three spawn sites
(_requestConfirmation, _doSpawn, _handlePhaseFailure), plus test coverage for plan-all behavior.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<interfaces>
<!-- Key contracts the executor needs. -->

From server/autopilot/AutopilotManager.js — start() signature:
```js
async start(projectName, opts = {}) {
  const startPhase = opts.startPhase || 1;
  const totalPhases = opts.totalPhases || 1;
  const projectRoot = opts.projectRoot || null;
  // opts.runType is passed but currently ignored
}
```

From server/routes/autopilot.js — plan-all route passes:
```js
await manager.start(projectName, {
  runType: 'plan-all',
  projectRoot: projectInfo.root,
  startPhase: projectInfo.startPhase,
  totalPhases: projectInfo.totalPhases,
});
```

From server/routes/autopilot.js — start route passes:
```js
await manager.start(projectName, {
  runType: mode || 'execute',
  projectRoot: projectInfo.root,
  startPhase: projectInfo.startPhase,
  totalPhases: projectInfo.totalPhases,
});
```

Current hardcoded spawn call in _doSpawn (line 309):
```js
const result = this._spawnFn(this._projectName, '/gsd:execute-phase', { ... });
```

Current hardcoded broadcast in _requestConfirmation (line 292):
```js
pendingCommand: `/gsd:execute-phase ${phaseNum}`,
```

Current hardcoded retry spawn in _handlePhaseFailure (line 381):
```js
this._spawnFn(this._projectName, '/gsd:execute-phase', { ... });
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Store runType in AutopilotManager and use it in all spawn sites</name>
  <files>server/autopilot/AutopilotManager.js, server/__tests__/autopilotManager.test.js</files>
  <behavior>
    - When runType='plan-all', _gsdCommand() returns '/gsd:plan-phase'
    - When runType='execute' (or any other value), _gsdCommand() returns '/gsd:execute-phase'
    - When runType is not passed, _gsdCommand() defaults to '/gsd:execute-phase'
    - _requestConfirmation() pendingCommand broadcast includes the runType-correct command string
    - _doSpawn() calls spawnFn with the runType-correct command
    - _handlePhaseFailure() retry call uses the runType-correct command
  </behavior>
  <action>
**Test first (add to server/__tests__/autopilotManager.test.js):**

Add a test block "runType='plan-all' uses /gsd:plan-phase" that:
1. Creates manager with runType='plan-all' passed to start()
2. Captures spawnFn call arguments
3. Confirms the first positional argument to spawnFn is '/gsd:plan-phase'
4. Confirms pendingCommand in the broadcast is '/gsd:plan-phase {N}'

**Implementation in server/autopilot/AutopilotManager.js:**

1. In the constructor, initialize: `this._runType = 'execute';`

2. In start(), after the existing const declarations, add:
   ```js
   this._runType = opts.runType || 'execute';
   ```

3. Add a private helper method `_gsdCommand()` that returns the correct command string:
   ```js
   _gsdCommand() {
     return this._runType === 'plan-all' ? '/gsd:plan-phase' : '/gsd:execute-phase';
   }
   ```

4. Update `_requestConfirmation(phaseNum)` — change the hardcoded string:
   ```js
   // Before:
   pendingCommand: `/gsd:execute-phase ${phaseNum}`,
   // After:
   pendingCommand: `${this._gsdCommand()} ${phaseNum}`,
   ```

5. Update `_doSpawn(phaseNum)` — change the hardcoded command arg to spawnFn:
   ```js
   // Before:
   const result = this._spawnFn(this._projectName, '/gsd:execute-phase', {
   // After:
   const result = this._spawnFn(this._projectName, this._gsdCommand(), {
   ```

6. Update `_handlePhaseFailure(phaseNum, reason)` — change the retry spawnFn call:
   ```js
   // Before:
   this._spawnFn(this._projectName, '/gsd:execute-phase', {
   // After:
   this._spawnFn(this._projectName, this._gsdCommand(), {
   ```

No changes needed to the client — the pendingCommand value is already read from the
broadcast event and displayed as-is in AutopilotControls. The correct command string
will flow through automatically once the broadcast is fixed.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server -- --grep "runType"</automated>
  </verify>
  <done>
    - New test passes: manager started with runType='plan-all' calls spawnFn with '/gsd:plan-phase'
    - Existing tests pass (no regressions — default runType still uses '/gsd:execute-phase')
    - npm run test:server exits 0
  </done>
</task>

</tasks>

<verification>
After task completes:
1. Run full server test suite: `npm run test:server` — all tests pass
2. Manually verify: start a plan-all run and confirm the pending_confirmation broadcast
   shows `pendingCommand: '/gsd:plan-phase N'` not `/gsd:execute-phase N`
</verification>

<success_criteria>
- AutopilotManager stores runType from opts.runType
- _gsdCommand() returns '/gsd:plan-phase' when runType='plan-all', '/gsd:execute-phase' otherwise
- All three spawn sites (_requestConfirmation, _doSpawn, _handlePhaseFailure) use _gsdCommand()
- Existing test suite passes with no regressions
- New test verifies plan-all runType routes to correct GSD command
</success_criteria>

<output>
After completion, create `.planning/quick/14-fix-plan-all-button-honor-runtype-to-sen/14-SUMMARY.md`
</output>
