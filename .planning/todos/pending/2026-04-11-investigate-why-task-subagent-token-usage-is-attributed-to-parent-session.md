---
created: 2026-04-11T09:05:48.198Z
title: Investigate why Task subagent token usage is attributed to parent session
area: api
files:
  - server/routes/pricing.js
  - server/db.js
  - scripts/hook-handler (SessionStart / PostToolUse hooks)
---

## Problem

The `/api/pricing/window` and `/api/pricing/cost` endpoints should show Sonnet/Haiku usage alongside Opus, because GSD runs on the budget profile (`model_profile: budget` in `.planning/config.json`): researcher/checker/verifier on Haiku, planner/executor on Sonnet. Yet the live dashboard's Model Breakdown shows only Opus (and all-time cost only shows Opus + a small amount of Sonnet from sessions last updated 2026-03-27).

After fixing the window query in quick task 42 to filter on `sessions.updated_at` instead of `started_at`, Sonnet still doesn't appear this week — because **no Sonnet sessions have been updated in the DB this week**, despite many Sonnet subagents running (gsd-planner, gsd-executor).

**Hypothesis:** When Claude Code spawns a subagent via the Task tool, the subagent runs as a sidechain inside the parent Claude Code process. The SessionStart / PostToolUse hooks may not fire for the sidechain, or they fire but the token usage is aggregated under the parent session's row in `token_usage` (which is keyed by `(session_id, model)` — so it might actually capture the model correctly but share session_id with the parent, causing confusion).

Worth verifying:
1. Do Task subagents trigger a fresh `SessionStart` hook? (check `scripts/hook-handler`)
2. Does `token_usage` get a new row per `(subagent_session_id, sonnet-model)`, or does it merge under parent session id?
3. Is there a separate session row being created but never `updated_at`-touched so `/window` filter still excludes it?
4. Check SQLite directly:
   ```sql
   SELECT model, COUNT(DISTINCT session_id), SUM(output_tokens), MAX(s.updated_at)
   FROM token_usage tu JOIN sessions s ON s.id = tu.session_id
   GROUP BY model;
   ```

**Impact:** Usage page under-reports Sonnet/Haiku cost, so the user can't verify that budget profile is actually saving money. Minor — fix is landed for the common case, this is the edge case fix.

## Solution

TBD. Likely requires:
- Reading `scripts/hook-handler` to see how SessionStart fires for subagents
- Possibly modifying the hook to create session rows for sidechain subagents
- Or changing `token_usage` keying so subagent rows are recorded separately

Defer until after v4.3 phases 45-47 ship, unless the Usage page accuracy becomes a blocker.
