---
phase: quick-48
status: complete
completed: 2026-04-17
files: 1
---

# Quick Task 48: Stop Re-open Tmux from auto-sending /gsd-resume-work

**One-liner:** Reverts the setTimeout added in quick-46; the Re-open Tmux button now only boots Claude and does not inject `/gsd-resume-work` automatically.

## What Changed

`server/routes/gsd.js` — `POST /api/gsd/projects/:name/reopen-tmux` handler.

The 10-second `setTimeout` that ran `tmux send-keys /gsd-resume-work` after Claude launched has been removed. The user can type `/gsd-resume-work` themselves when resume is actually wanted.

## Why

Auto-sending `/gsd-resume-work` on every reopen is unwanted because it forces a resume flow even when the user just wants a fresh Claude session.

## Verification

- `npm run test:server` passed for all route-related tests. Two pre-existing failures (`autopilotManager.test.js`, `tmux.test.js:STAT-02`) are unrelated to this route.
