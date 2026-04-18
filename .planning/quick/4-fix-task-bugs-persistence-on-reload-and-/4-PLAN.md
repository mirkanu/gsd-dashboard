---
phase: quick
plan: 4
type: execute
wave: 1
depends_on: []
files_modified:
  - server/routes/gsd.js
autonomous: true
requirements: [TASK-BUG-01, TASK-BUG-02]
must_haves:
  truths:
    - "Tasks created locally persist across page reloads"
    - "Tasks created on Railway persist across deploys"
    - "Clicking Archive removes the task and it appears in the archived list"
    - "Archived tasks do not reappear in the open list after toggling views"
  artifacts:
    - path: "server/routes/gsd.js"
      provides: "Fixed task routes with GSD_DATA_URL proxy + archive integer handling"
  key_links:
    - from: "client TasksTab"
      to: "/api/gsd/projects/:key/tasks"
      via: "fetch in useEffect and handleArchive"
      pattern: "api\\.gsd\\.tasks\\.(list|create|update)"
    - from: "POST/GET/PATCH task routes"
      to: "GSD_DATA_URL upstream or local SQLite"
      via: "GSD_DATA_URL guard (new)"
      pattern: "GSD_DATA_URL.*tasks"
---

<objective>
Fix two task bugs in server/routes/gsd.js.

Bug 1 — Tasks disappear on reload: Task routes (POST/GET/PATCH /projects/:key/tasks) lack the GSD_DATA_URL proxy guard that all other GSD routes have. When Railway is configured with GSD_DATA_URL (pointing at the local dev tunnel), task data is written to Railway's ephemeral SQLite — wiped on every redeploy. Sessions, projects, and messages all proxy correctly through GSD_DATA_URL; tasks must too.

Bug 2 — Archive does not work: The PATCH route parses archived with `archived === true ? 1 : archived === false ? 0 : null`. The client sends `archived: 1` or `archived: 0` (integers, per the GsdTask type `archived: 0 | 1`). Strict equality `1 === true` is false, so archivedInt always resolves to null. COALESCE(null, archived) keeps the original 0 — task never archives.

Purpose: Tasks must persist across page reloads and deploys; archive/unarchive must work end-to-end.
Output: Fixed server/routes/gsd.js with proxy guards and corrected archived coercion.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@server/routes/gsd.js
@server/db.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix archive integer coercion in PATCH route</name>
  <files>server/routes/gsd.js</files>
  <action>
In the PATCH /projects/:key/tasks/:id route (around line 348), fix the archived coercion:

Current (broken):
```js
const archivedInt = archived === true ? 1 : archived === false ? 0 : null;
```

Fix (accepts both boolean and integer, since client sends 0|1):
```js
const archivedInt = (archived === true || archived === 1) ? 1
                  : (archived === false || archived === 0) ? 0
                  : null;
```

This ensures `{ archived: 1 }` (from the client) correctly sets archivedInt to 1, making COALESCE(1, archived) = 1.
  </action>
  <verify>
    <automated>node -e "
const {stmts} = require('./server/db');
// Insert a test task
const t = stmts.insertTask.get('test-fix', 'Archive test', null);
console.log('created archived=', t.archived);
// Archive it using integer 1 (as client sends)
const archived = 1;
const archivedInt = (archived === true || archived === 1) ? 1
                  : (archived === false || archived === 0) ? 0 : null;
const updated = stmts.updateTask.get(null, null, archivedInt, t.id);
console.log('after archive archived=', updated.archived);
if (updated.archived !== 1) process.exit(1);
console.log('PASS');
require('./server/db').db.prepare('DELETE FROM project_tasks WHERE project_key = ?').run('test-fix');
"</automated>
  </verify>
  <done>PATCH with { archived: 1 } sets task archived=1 in the DB. PATCH with { archived: 0 } sets archived=0. Archived list shows the task; open list no longer shows it after toggle.</done>
</task>

<task type="auto">
  <name>Task 2: Add GSD_DATA_URL proxy guards to all three task routes</name>
  <files>server/routes/gsd.js</files>
  <action>
All three task routes (POST create, GET list, PATCH update) need the same GSD_DATA_URL proxy pattern used by other routes. Without this, on Railway tasks go to the ephemeral local SQLite instead of the persistent local dev server.

For each route, add the proxy guard at the top of the handler, BEFORE the local SQLite logic. Follow the exact same pattern as the nearby POST /projects/:name/archive route.

POST /projects/:key/tasks — add at the top of the handler:
```js
if (GSD_DATA_URL) {
  try {
    const upstream = await fetch(
      `${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(key)}/tasks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(10000),
      }
    );
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message });
  }
}
```

Also change `router.post` to `router.post` with async handler: `router.post('/projects/:key/tasks', async (req, res) => {`

GET /projects/:key/tasks — add at the top:
```js
if (GSD_DATA_URL) {
  const qs = req.query.archived === 'true' ? '?archived=true' : '';
  try {
    const upstream = await fetch(
      `${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(key)}/tasks${qs}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message });
  }
}
```

Change to async handler: `router.get('/projects/:key/tasks', async (req, res) => {`

PATCH /projects/:key/tasks/:id — add at the top:
```js
if (GSD_DATA_URL) {
  try {
    const upstream = await fetch(
      `${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(req.params.key)}/tasks/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(10000),
      }
    );
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message });
  }
}
```

Change to async handler: `router.patch('/projects/:key/tasks/:id', async (req, res) => {`

Note: The PATCH route currently references `req.params.key` but the destructuring only has `const { id } = req.params`. Add `const { key, id } = req.params;` to replace the existing `const { id } = req.params;`.
  </action>
  <verify>
    <automated>npm run test:server 2>&amp;1 | tail -20</automated>
  </verify>
  <done>All three task routes have GSD_DATA_URL proxy guards. npm run test:server passes. When GSD_DATA_URL is set, task reads/writes proxy to the upstream server. When not set, they use local SQLite as before.</done>
</task>

</tasks>

<verification>
After both tasks:
1. Run `npm run test:server` — all tests pass
2. Manual verify (archive fix): Start server with `npm run dev`, create a task, click Archive — task disappears from open list, click "Show archived" — task appears in archived list
3. Manual verify (persistence): Create a task, reload the page — task is still there
</verification>

<success_criteria>
- npm run test:server passes with no failures
- PATCH { archived: 1 } correctly archives a task (archived=1 in DB)
- Tasks created locally persist across page reloads
- On Railway (GSD_DATA_URL set), task API calls proxy to the upstream server instead of ephemeral local SQLite
- Archive/unarchive toggle works: task moves between lists and stays there
</success_criteria>

<output>
After completion, create `.planning/quick/4-fix-task-bugs-persistence-on-reload-and-/4-SUMMARY.md`
</output>
