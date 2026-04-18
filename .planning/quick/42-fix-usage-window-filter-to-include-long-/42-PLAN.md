---
phase: 42-fix-usage-window-filter
plan: 42
type: execute
wave: 1
depends_on: []
files_modified:
  - server/routes/pricing.js
  - server/__tests__/api.test.js
autonomous: true
requirements:
  - USG-WIN-01
must_haves:
  truths:
    - "Weekly Model Breakdown includes sessions that started before the week boundary but received token updates during the current week"
    - "Daily Model Breakdown includes sessions active today even if started yesterday or earlier"
    - "/api/pricing/window response shape is unchanged (backward-compat)"
    - "Existing server tests still pass"
  artifacts:
    - path: "server/routes/pricing.js"
      provides: "Three window-scoped queries filter on sessions.updated_at instead of sessions.started_at"
      contains: "s.updated_at >= ?"
    - path: "server/__tests__/api.test.js"
      provides: "Regression test proving long-running sessions appear in weekly by_model"
      contains: "pricing/window includes long-running sessions"
  key_links:
    - from: "server/routes/pricing.js tokensForWindow()"
      to: "sessions.updated_at column"
      via: "SQL WHERE clause"
      pattern: "s\\.updated_at >= \\?"
    - from: "server/routes/pricing.js weeklyByProjectModel query"
      to: "sessions.updated_at column"
      via: "SQL WHERE clause"
      pattern: "s\\.updated_at >= \\?"
---

<objective>
Fix `/api/pricing/window` so long-running sessions (started before the week/day boundary but still active) show up in the Model Breakdown.

Purpose: User's weekly Model Breakdown currently only shows Opus because Sonnet sessions started before Monday are excluded. Users expect any session active during the window to contribute to the window's totals.

Output: Three `WHERE s.started_at >= ?` clauses in `server/routes/pricing.js` changed to `WHERE s.updated_at >= ?`, plus a regression test that inserts a long-running session (started before weekStart, updated after) and asserts it appears in weekly `by_model`.

Tradeoff acknowledged: This slightly overcounts — a long-running session contributes ALL its tokens to the window, not just tokens added during the window. This is acceptable because `token_usage` has no per-row timestamp. The event-sourced alternative is a future phase, not this quick task.
</objective>

<context>
@./CLAUDE.md
@./.claude/rules/backend-node.md
@server/routes/pricing.js
@server/db.js
@server/__tests__/api.test.js

<interfaces>
<!-- Relevant schema and prepared statements for executor context -->

From server/db.js (sessions table and insertSession):
```
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  cwd TEXT,
  model TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at TEXT,
  metadata TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  -- updated_at was added via migration; NOT NULL, auto-set on insert and update
)

stmts.insertSession:
  INSERT INTO sessions (id, name, status, cwd, model, started_at, updated_at, metadata)
  VALUES (?, ?, ?, ?, ?, strftime('now'), strftime('now'), ?)
  -- Signature: (id, name, status, cwd, model, metadata)
  -- NOTE: started_at and updated_at are set to NOW — to backdate either, run a follow-up UPDATE via db.prepare.
```

From server/routes/pricing.js (current failing queries — three locations):
- Line ~145: `tokensForWindow(since)` inside GET /window — used for BOTH daily and weekly model breakdown. Called twice (once with todayMidnight, once with weekStart).
- Line ~210: `weeklyByProjectModel` query for weekly by_project breakdown.
- (usage-history at line ~265 is OUT OF SCOPE — it's a different endpoint whose semantics are "what started each day", not "what was active".)

All three window queries currently have: `WHERE s.started_at >= ?`
All three must become: `WHERE s.updated_at >= ?`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add regression test for long-running session in weekly window</name>
  <files>server/__tests__/api.test.js</files>
  <behavior>
    New test in the same describe block as the existing "GET /api/pricing/window returns tokens and by_model breakdown" test (around line 870).

    Test name: `it("GET /api/pricing/window includes long-running sessions active in the window", ...)`

    Setup (must be deterministic regardless of the day the test runs):
    1. Compute weekStart the same way pricing.js does (Monday midnight UTC of the current week).
    2. Pick a backdated `started_at` that is clearly BEFORE weekStart — e.g. 10 days ago ISO string.
    3. Pick an `updated_at` that is clearly INSIDE the current week — e.g. `new Date().toISOString()` (now).
    4. Insert a session via `stmts.insertSession.run("longrun-sess", "Long Runner", "active", "/tmp/longrun", "claude-sonnet-4-6", null)`.
    5. Override both timestamps directly:
       `db.prepare("UPDATE sessions SET started_at = ?, updated_at = ? WHERE id = ?").run(tenDaysAgoIso, nowIso, "longrun-sess")`.
    6. Insert a distinctive token_usage row for that session with a clearly identifiable input_tokens value (e.g. 777777) for model `claude-sonnet-4-6`. Use the existing pattern — look for how other tests in this file insert into token_usage (search for `insertToken` or `token_usage` above line 870 for the established pattern) and match it. If there is no helper, use:
       `db.prepare("INSERT INTO token_usage (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, baseline_input, baseline_output, baseline_cache_read, baseline_cache_write) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0)").run("longrun-sess", "claude-sonnet-4-6", 777777)`.
       Verify the token_usage columns by grepping the schema in server/db.js first if unsure.

    Assertions (these MUST fail against the current `s.started_at >= ?` code, and pass after the fix):
    - `const res = await fetch("/api/pricing/window");` returns 200.
    - `data.weekly.by_model` contains an entry whose `model === "claude-sonnet-4-6"` AND whose `input_tokens >= 777777`. (Use `>=` not `===` because other tests in the same suite may have added sonnet tokens.)
    - `data.weekly.input_tokens >= 777777`.

    Cleanup at end of test (to avoid polluting later tests in the same describe):
    - `db.prepare("DELETE FROM token_usage WHERE session_id = ?").run("longrun-sess");`
    - `db.prepare("DELETE FROM sessions WHERE id = ?").run("longrun-sess");`
  </behavior>
  <action>
    1. Open `server/__tests__/api.test.js` and locate the existing test at line ~870: `it("GET /api/pricing/window returns tokens and by_model breakdown", ...)`.
    2. Confirm `db` and `stmts` are already imported at the top of the file (they are used by the existing tests — grep for `require.*db` to confirm; do NOT add duplicate imports).
    3. Confirm the exact schema of `token_usage` by reading `server/db.js` so the manual INSERT matches all NOT NULL columns. If a prepared statement like `stmts.insertToken` or similar exists, prefer it.
    4. Add the new test IMMEDIATELY AFTER the existing window test, still inside the same `describe` block, following the behavior spec above.
    5. Use `new Date()` arithmetic for weekStart: replicate the exact logic from pricing.js lines 129-133 so the test boundary matches the route's boundary.
    6. Run `npm run test:server -- --grep "long-running"` (or equivalent nodejs test runner filter for this file) to confirm the test is RED against the unmodified route. If the test runner doesn't support filtering, run the full `npm run test:server` and look for the new failing assertion.

    WHY this approach: We cannot pass the `started_at` column into `stmts.insertSession` directly — the prepared statement hardcodes `strftime('now')`. A follow-up UPDATE is the minimum-diff way to backdate without introducing a new prepared statement. We use a distinctive `input_tokens` value (777777) so the assertion tolerates other tests' sessions in the same DB.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -40</automated>
  </verify>
  <done>New test exists, is RED (fails because the route still filters on started_at). All existing tests still pass.</done>
</task>

<task type="auto">
  <name>Task 2: Switch window queries from started_at to updated_at</name>
  <files>server/routes/pricing.js</files>
  <action>
    1. Open `server/routes/pricing.js`.
    2. Change line ~145 inside `tokensForWindow(since)`:
       - FROM: `WHERE s.started_at >= ?`
       - TO:   `WHERE s.updated_at >= ?`
    3. Change line ~210 inside the `weeklyByProjectModel` query:
       - FROM: `WHERE s.started_at >= ?`
       - TO:   `WHERE s.updated_at >= ?`
    4. Leave the `/usage-history` route (lines ~252-289) UNCHANGED. That endpoint's semantics are "what started each day" not "what was active each day", and changing it would also require changing the `DATE(s.started_at) as date` GROUP BY, which is out of scope for this quick task.
    5. Leave the response shape and all other fields untouched. The only diff should be the WHERE clauses in two SQL strings. (Counted: `tokensForWindow` has one WHERE clause used in two call sites (daily + weekly) = 2 logical queries, plus `weeklyByProjectModel` = the "third query" referenced in the description. All three are now covered by the two source-code edits.)
    6. Re-run the server tests: `npm run test:server`. The new regression test from Task 1 MUST now pass, and all existing tests MUST still pass (especially the existing "GET /api/pricing/window returns tokens and by_model breakdown" test — its shape assertions must remain green).

    WHY: `sessions.updated_at` is maintained by `touchSession` and `updateSession` on every token write path, so any session receiving tokens during the window will have `updated_at` inside the window even if `started_at` predates it. Slight overcounting of pre-window tokens is the accepted tradeoff (documented in objective).
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -40</automated>
  </verify>
  <done>
    - Both WHERE clauses in pricing.js use `s.updated_at >= ?`.
    - `npm run test:server` passes including the new long-running-session regression test.
    - Response shape of /api/pricing/window is byte-for-byte identical in field names and types (only values differ).
    - `/api/pricing/usage-history` is untouched.
  </done>
</task>

</tasks>

<verification>
- `npm run test:server` — full backend suite green, including both the existing window test and the new regression test.
- Manual mental check: grep `server/routes/pricing.js` for `s.started_at` — should show ONLY occurrences inside `/usage-history` route, not inside `/window` route.
</verification>

<success_criteria>
- Three window-scoped SQL filters (two source edits covering daily tokensForWindow, weekly tokensForWindow, and weeklyByProjectModel) now use `s.updated_at >= ?`.
- New regression test inserts a session with `started_at` 10 days ago and `updated_at` now, and asserts the session's distinctive token count appears in `data.weekly.by_model` and `data.weekly.input_tokens`.
- All existing server tests still pass.
- `/api/pricing/window` response shape unchanged.
- `/api/pricing/usage-history` untouched.
</success_criteria>

<output>
After completion, create `.planning/quick/42-fix-usage-window-filter-to-include-long-/42-SUMMARY.md` documenting: the two source edits, the new test, the accepted overcounting tradeoff, and the deferred event-sourced token_usage timestamping as a future phase.
</output>
