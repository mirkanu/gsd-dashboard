---
phase: quick-29
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/gsd/tmux.js
  - server/routes/gsd.js
  - server/routes/terminal.js
autonomous: true
requirements: [PERF-29]
must_haves:
  truths:
    - "/api/gsd/projects responds in under 500ms for 5 projects instead of 5-15s"
    - "Repeated polls within 5s return the cached response immediately"
    - "gsd_messages table is no longer written on every terminal keystroke"
    - "lastMessages query uses a fast GROUP BY MAX(id) rather than a correlated subquery"
  artifacts:
    - path: "server/gsd/tmux.js"
      provides: "Async capturePaneText + detectSessionState variants for API route use"
    - path: "server/routes/gsd.js"
      provides: "Async /api/gsd/projects handler with Promise.all parallelism and 5s cache"
    - path: "server/routes/terminal.js"
      provides: "Terminal WS handler with dead insertGsdMessage call removed"
  key_links:
    - from: "server/routes/gsd.js"
      to: "server/gsd/tmux.js"
      via: "capturePaneTextAsync / detectSessionStateAsync imports"
      pattern: "capturePaneTextAsync|detectSessionStateAsync"
    - from: "server/routes/gsd.js"
      to: "in-memory projectsCache"
      via: "cache check at top of route handler"
      pattern: "projectsCache"
---

<objective>
Cut /api/gsd/projects response time from 5-15s to under 500ms by converting blocking
tmux subprocess calls to async, parallelising across projects with Promise.all, and
adding a 5-second in-memory cache. Also fix the O(n²) lastMessages query and remove
dead terminal message logging that writes to gsd_messages on every keystroke.

Purpose: The dashboard polls /api/gsd/projects frequently. Each blocked request stalls
the Node.js event loop and starves all other requests (WebSocket, hooks) of CPU.
Output: Faster project list, reduced DB write pressure, healthier event loop.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@server/gsd/tmux.js
@server/routes/gsd.js
@server/routes/terminal.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add async tmux helpers + cache to /api/gsd/projects</name>
  <files>server/gsd/tmux.js, server/routes/gsd.js</files>
  <action>
**server/gsd/tmux.js — add async variants (do NOT remove sync versions; classifier loop uses them):**

1. Add `const { execFile } = require('child_process');` and `const { promisify } = require('util');` at top.
2. Add `const execFileAsync = promisify(execFile);` after the imports.
3. Add `async function capturePaneTextAsync(sessionName)` that calls:
   ```js
   const { stdout } = await execFileAsync('tmux', ['capture-pane', '-p', '-J', '-t', sessionName], { encoding: 'utf8', timeout: 2000 });
   return stdout;
   ```
   Wrapped in try/catch returning null on any error.
4. Add `async function detectSessionStateAsync(sessionName)` that mirrors the logic of
   `detectSessionState` but calls `capturePaneTextAsync` and `isTmuxSessionActive` (sync is
   fine for has-session — it's fast). Return the same string literals.
5. Add `async function detectRateLimitAsync(sessionNames)` mirroring `detectRateLimit` but
   using `capturePaneTextAsync`.
6. Export new functions: add to `module.exports`.

**server/routes/gsd.js — rewrite the /api/gsd/projects handler to be async and cached:**

1. Add an in-memory cache near the top of the file (after router is created):
   ```js
   let projectsCache = null;
   let projectsCacheExpiry = 0;
   const PROJECTS_CACHE_TTL = 5000; // 5 seconds
   ```

2. Update the import line for tmux to also import the new async functions:
   `const { isTmuxSessionActive, capturePaneText, detectSessionState, detectRateLimit, extractStatusLine, capturePaneTextAsync, detectSessionStateAsync, detectRateLimitAsync } = require('../gsd/tmux');`

3. In the local (non-GSD_DATA_URL) branch of the `/projects` handler, add a cache check
   immediately after `const { projects } = loadConfig();`:
   ```js
   const now = Date.now();
   if (projectsCache && now < projectsCacheExpiry) {
     return res.json(projectsCache);
   }
   ```

4. Convert the `projects.map(...)` to `Promise.all(projects.map(async (...) => { ... }))`.
   Inside the async map callback:
   - Replace `detectSessionState(tmux_session ?? null)` with `await detectSessionStateAsync(tmux_session ?? null)`.
   - For the Telegram notification branch that calls `capturePaneText(tmux_session)`, replace with `await capturePaneTextAsync(tmux_session)`.
   - For `statusText`: replace the inline `capturePaneText(tmux_session)` with `await capturePaneTextAsync(tmux_session)`.
   - `isTmuxSessionActive` stays sync (tmux has-session is sub-millisecond).

5. Replace `detectRateLimit(tmuxSessions)` with `await detectRateLimitAsync(tmuxSessions)`.

6. After assembling the `result` object (`{ projects: data, rateLimit }`), store it in the
   cache before returning:
   ```js
   projectsCache = result;
   projectsCacheExpiry = Date.now() + PROJECTS_CACHE_TTL;
   res.json(result);
   ```

   Use `const result = { projects: data, rateLimit };` before storing.

The `now` variable for IDLE_PAUSED_MS calculation is already declared inside the handler —
make sure it's declared once, not duplicated.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -20</automated>
  </verify>
  <done>
    Tests pass. Manually confirmed: two rapid curl requests to /api/gsd/projects — second
    returns immediately (cache hit). First request completes in under 2s.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix lastMessages query + remove dead terminal message logging</name>
  <files>server/routes/gsd.js, server/routes/terminal.js</files>
  <action>
**server/routes/gsd.js — replace correlated lastMessages subquery:**

Replace lines 73-80:
```js
const lastMessages = db.prepare(`
  SELECT project, content, message_type, created_at
  FROM gsd_messages m1
  WHERE m1.id = (
    SELECT MAX(m2.id) FROM gsd_messages m2
    WHERE m2.project = m1.project AND (m2.message_type IS NULL OR m2.message_type != 'hidden')
  )
`).all();
```

With:
```js
const lastMessages = db.prepare(`
  SELECT project, content, message_type, created_at
  FROM gsd_messages
  WHERE id IN (
    SELECT MAX(id) FROM gsd_messages
    WHERE message_type IS NULL OR message_type != 'hidden'
    GROUP BY project
  )
`).all();
```

This runs a single GROUP BY scan instead of one correlated subquery per row.

**server/routes/terminal.js — remove dead insertGsdMessage call:**

Around line 101-102, remove the `stmts?.insertGsdMessage?.run(...)` call and its
surrounding try/catch. The `lineBuffer` accumulation above it is also unused now, so
remove the entire lineBuffer mechanism (lines accumulating into lineBuffer on every
character, the flush on Enter, and the `let lineBuffer = '';` declaration).

Keep the `pty.write(str)` call — that must remain. The `ws.on('message', ...)` handler
should still handle resize messages and write all other input to pty unchanged. Only
remove the lineBuffer tracking and the insertGsdMessage flush on Enter.

Do not touch any other terminal or WebSocket logic.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -20</automated>
  </verify>
  <done>
    Tests pass. server/routes/terminal.js no longer references insertGsdMessage.
    The lastMessages query no longer contains a correlated subquery.
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. `npm run test:server` passes with no new failures.
2. `node -e "require('./server/gsd/tmux.js'); console.log('ok')"` runs without error from /data/home/gsddashboard.
3. `grep -n "execFileSync" server/gsd/tmux.js` still shows the original sync functions intact (classifier loop depends on them).
4. `grep -n "insertGsdMessage" server/routes/terminal.js` returns no matches.
5. `grep -n "capturePaneTextAsync\|detectSessionStateAsync" server/routes/gsd.js` shows the async calls in use.
</verification>

<success_criteria>
- /api/gsd/projects no longer blocks the event loop for 5-15s
- Parallel Promise.all across projects means tmux calls overlap instead of stacking
- 5s cache means repeated polls hit memory, not tmux subprocesses
- lastMessages query uses GROUP BY MAX(id) — O(n) not O(n²)
- terminal.js no longer writes to gsd_messages on every keystroke
- All existing server tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/29-reduce-terminal-and-project-info-load-la/29-SUMMARY.md`
</output>
