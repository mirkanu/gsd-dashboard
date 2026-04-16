---
phase: quick-46
plan: 01
subsystem: server/routes/gsd.js
tags: [tmux, gsd, resume-work, async]
key_files:
  modified:
    - server/routes/gsd.js
decisions:
  - "10s delay before sending /gsd:resume-work — enough for Claude Code to fully boot"
  - "fire-and-forget setTimeout so HTTP response returns immediately"
  - "silent catch so server never crashes on best-effort dispatch"
metrics:
  duration: "5min"
  completed: "2026-04-16"
  tasks: 1
  files: 1
---

# Quick Task 46: Auto-send /gsd:resume-work on reopen-tmux Summary

**One-liner:** Adds fire-and-forget setTimeout to reopen-tmux route that sends /gsd:resume-work into the tmux session ~10s after Claude Code launches.

## What Changed

`server/routes/gsd.js` — `POST /api/gsd/projects/:name/reopen-tmux` handler (around line 337).

After the existing `execFileSync` call that starts `claude --dangerously-skip-permissions`, a `setTimeout` block (10 000 ms delay) injects `/gsd:resume-work\n` into the tmux session via `tmux send-keys`. The HTTP response is returned immediately before the timer fires, so the caller is never blocked.

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

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `grep -n "resume-work" server/routes/gsd.js` returns lines 338 and 341
- `npm run test:server` — 150 passing, 7 pre-existing failures (readProjectMeta, agent data proxy, app-settings list) unrelated to this change

## Commit

`234f54d` — feat(quick-46): auto-send /gsd:resume-work after reopen-tmux

## Self-Check: PASSED

- server/routes/gsd.js contains the setTimeout block — FOUND
- commit 234f54d exists — FOUND
