---
phase: quick-31
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/gsd/tmux.js
  - server/routes/gsd.js
  - server/routes/terminal.js
autonomous: true
requirements: [QUICK-31]

must_haves:
  truths:
    - "isTmuxSessionActive never blocks the event loop"
    - "detectRateLimitAsync checks all sessions in parallel"
    - "Terminal WS upgrade does not block on sync execFileSync"
  artifacts:
    - path: "server/gsd/tmux.js"
      provides: "isTmuxSessionActiveAsync + parallel detectRateLimitAsync"
      exports: ["isTmuxSessionActiveAsync"]
    - path: "server/routes/gsd.js"
      provides: "async tmuxActive using isTmuxSessionActiveAsync"
    - path: "server/routes/terminal.js"
      provides: "async upgrade handler using isTmuxSessionActiveAsync"
  key_links:
    - from: "server/routes/gsd.js"
      to: "isTmuxSessionActiveAsync"
      via: "Promise.all per-project callback"
    - from: "server/routes/terminal.js"
      to: "isTmuxSessionActiveAsync"
      via: "async upgrade handler"
    - from: "server/gsd/tmux.js detectRateLimitAsync"
      to: "isTmuxSessionActiveAsync"
      via: "Promise.all over sessionNames"
---

<objective>
Fix the three remaining synchronous bottlenecks that block the Node.js event loop during dashboard and terminal load.

Purpose: `isTmuxSessionActive` still uses `execFileSync` — every call stalls the event loop up to 2 seconds. The dashboard calls it once per project inside `Promise.all`, serial in effect. `detectRateLimitAsync` calls it synchronously in a sequential `for` loop, defeating the async pane capture. The terminal WS upgrade calls it before handing off the socket.

Output: Async `isTmuxSessionActive`, parallel rate-limit detection, non-blocking terminal WS upgrade.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@server/gsd/tmux.js
@server/routes/gsd.js
@server/routes/terminal.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add isTmuxSessionActiveAsync and parallelize detectRateLimitAsync in tmux.js</name>
  <files>server/gsd/tmux.js</files>
  <action>
1. Add `isTmuxSessionActiveAsync` immediately after `isTmuxSessionActive` (around line 22):

```js
async function isTmuxSessionActiveAsync(sessionName) {
  if (!sessionName) return false;
  try {
    await execFileAsync('tmux', ['has-session', '-t', sessionName], { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
```

2. Rewrite `detectRateLimitAsync` (lines 313-327) to use `Promise.all` instead of the sequential `for` loop:

```js
async function detectRateLimitAsync(sessionNames) {
  const results = await Promise.all(
    sessionNames.filter(Boolean).map(async (name) => {
      if (!(await isTmuxSessionActiveAsync(name))) return null;
      const text = await capturePaneTextAsync(name);
      if (!text) return null;
      const recent = text.split('\n').slice(-10).join('\n');
      for (const pattern of RATE_LIMIT_PATTERNS) {
        if (pattern.test(recent)) {
          const resetAt = parseResetTime(recent);
          return { active: true, resetAt: resetAt ? resetAt.toISOString() : null };
        }
      }
      return null;
    })
  );
  const hit = results.find(Boolean);
  return hit ?? { active: false, resetAt: null };
}
```

3. Export `isTmuxSessionActiveAsync` in the `module.exports` line at the bottom.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -20</automated>
  </verify>
  <done>
    - `isTmuxSessionActiveAsync` is exported and uses `execFileAsync` (not `execFileSync`)
    - `detectRateLimitAsync` uses `Promise.all` for parallel session checks
    - All existing server tests pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Use isTmuxSessionActiveAsync in gsd.js route and terminal.js WS upgrade</name>
  <files>server/routes/gsd.js, server/routes/terminal.js</files>
  <action>
**server/routes/gsd.js:**

1. Update the import at the top to also pull in `isTmuxSessionActiveAsync`:
   ```js
   const { isTmuxSessionActive, isTmuxSessionActiveAsync, ... } = require('../gsd/tmux');
   ```
   (Keep `isTmuxSessionActive` in import only if still used elsewhere; if line 122 is the only call site, just replace.)

2. On line 122, change:
   ```js
   tmuxActive: isTmuxSessionActive(tmux_session),
   ```
   to:
   ```js
   tmuxActive: await isTmuxSessionActiveAsync(tmux_session),
   ```
   This is already inside an `async` `Promise.all` callback so `await` is valid.

**server/routes/terminal.js:**

1. Update the import at the top:
   ```js
   const { isTmuxSessionActiveAsync } = require('../gsd/tmux');
   ```
   Remove the old `isTmuxSessionActive` import (it is only used in the upgrade handler).

2. Make the `upgrade` handler async and await the check:
   ```js
   server.on('upgrade', async (req, socket, head) => {
     ...
     if (!(await isTmuxSessionActiveAsync(session))) {
       wss.handleUpgrade(req, socket, head, (ws) => {
         ws.close(4004, 'session inactive');
       });
       return;
     }
     ...
   });
   ```
   Note: Node.js `EventEmitter` handles async listeners fine here — errors are emitted on `socket`, which destroys the connection safely. No other change needed.

3. Remove the `loadConfig` sync `fs.readFileSync` only if it can be trivially cached; otherwise leave it as-is (file reads are fast and this is a one-time-per-connection cost, not per-request on the hot path).
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -20</automated>
  </verify>
  <done>
    - `server/routes/gsd.js` calls `isTmuxSessionActiveAsync` (no sync execFileSync on the project list path)
    - `server/routes/terminal.js` upgrade handler is async and awaits `isTmuxSessionActiveAsync`
    - All server tests pass
  </done>
</task>

</tasks>

<verification>
Run full server test suite: `cd /data/home/gsddashboard && npm run test:server`

Grep confirms no remaining sync calls on the hot paths:
```
grep -n "isTmuxSessionActive(" server/routes/gsd.js server/routes/terminal.js server/gsd/tmux.js
```
Should show only `isTmuxSessionActiveAsync` at the call sites (gsd.js line ~122, terminal.js upgrade handler, tmux.js detectRateLimitAsync).
</verification>

<success_criteria>
- `isTmuxSessionActiveAsync` exported from `server/gsd/tmux.js`
- `detectRateLimitAsync` uses `Promise.all` — all session checks run in parallel
- `server/routes/gsd.js` per-project callback uses async variant
- `server/routes/terminal.js` upgrade handler is async
- `npm run test:server` passes with no failures
</success_criteria>

<output>
After completion, create `.planning/quick/31-fix-remaining-dashboard-and-terminal-loa/31-SUMMARY.md` with what was changed and any deviations from this plan.
</output>
