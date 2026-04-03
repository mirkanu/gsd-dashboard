# Quick Task 16: Reopen terminal launches Claude with --dangerously-skip-permissions

**Date:** 2026-04-03
**Status:** Complete

## Change
When clicking "Re-open" on a project card with a dead tmux session, the server now:
1. Creates the tmux session (existing behavior)
2. Sends `claude --dangerously-skip-permissions` into the session (new)

This means Claude Code starts immediately with full permissions, so autopilot commands and `/gsd:*` workflows work without manual intervention.

## Files changed
- `server/routes/gsd.js:281-282` — Added `send-keys` call after `new-session` in reopen-tmux route
