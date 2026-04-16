---
phase: quick-46
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/routes/gsd.js
autonomous: true
requirements: [QUICK-46]
must_haves:
  truths:
    - "Re-opening a paused project automatically sends /gsd:resume-work into the tmux session after Claude boots"
    - "The HTTP response is not delayed — the resume command is sent asynchronously"
    - "Failures in the async resume step are silent and do not crash the server"
  artifacts:
    - path: "server/routes/gsd.js"
      provides: "reopen-tmux route with async resume-work dispatch"
      contains: "gsd:resume-work"
  key_links:
    - from: "reopen-tmux route"
      to: "tmux send-keys /gsd:resume-work"
      via: "setTimeout + execFileSync, ~10s delay"
      pattern: "gsd:resume-work"
---

<objective>
After the reopen-tmux route creates a tmux session and launches Claude, automatically send `/gsd:resume-work` into the session once Claude has finished booting.

Purpose: Projects are now always paused via `/gsd:pause-work`, so resuming should mirror that by running `/gsd:resume-work` automatically — no manual typing required.
Output: Modified `server/routes/gsd.js` reopen-tmux handler with async resume dispatch.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add async /gsd:resume-work dispatch to reopen-tmux route</name>
  <files>server/routes/gsd.js</files>
  <action>
In `server/routes/gsd.js`, locate the `POST /api/gsd/projects/:name/reopen-tmux` route (around line 309). After the existing `execFileSync` call that sends `claude --dangerously-skip-permissions` (line 337) and BEFORE the `return res.json({ ok: true })`, add a fire-and-forget setTimeout block:

```js
// After Claude boots (~10s), send /gsd:resume-work to resume the GSD session
setTimeout(() => {
  try {
    execFileSync('tmux', ['send-keys', '-t', tmux_session, '/gsd:resume-work', 'Enter'], { stdio: 'ignore', timeout: 5000 });
  } catch (_) {
    // best-effort — if Claude isn't ready yet, the user can type it manually
  }
}, 10000);
```

This must be placed between line 337 (send-keys for claude) and line 338 (return res.json). The HTTP response returns immediately (non-blocking). The proxy branch (lines 313-318) must NOT be touched — forwarding to GSD_DATA_URL already delegates to the remote server which will run the updated logic.

Do not change any other behaviour in the route.
  </action>
  <verify>
    <automated>npm run test:server 2>&1 | tail -20</automated>
  </verify>
  <done>
    - `server/routes/gsd.js` contains the setTimeout block sending `/gsd:resume-work` after 10000ms
    - Existing server tests pass
    - HTTP response shape is unchanged (`{ ok: true }`)
  </done>
</task>

</tasks>

<verification>
- `grep -n "resume-work" /data/home/gsddashboard/server/routes/gsd.js` returns a line with the setTimeout block
- `npm run test:server` passes without new failures
</verification>

<success_criteria>
Calling `POST /api/gsd/projects/:name/reopen-tmux` responds immediately with `{ ok: true }`. Approximately 10 seconds later, `/gsd:resume-work\n` is injected into the tmux session, automatically resuming GSD context in the newly opened Claude session.
</success_criteria>

<output>
After completion, create `.planning/quick/46-when-pressing-re-open-tmux-on-a-paused-p/46-SUMMARY.md` summarising what was changed and the commit SHA.
</output>
