---
plan: 71-02
phase: 71-claude-md-first-automation-refactor
status: complete
date: 2026-05-06
---

## Summary

Added the verify-work CLAUDE.md behavioral rule (D-03) and the gsd-complete-milestone verification backstop (D-05) as specified in Phase 71 Plan 02.

## Files Changed

- `/data/home/gsddashboard/.claude/get-shit-done/bin/lib/profile-output.cjs` — Added new rule to `CLAUDE_MD_WORKFLOW_ENFORCEMENT` array: "After every plan execution completes, run `/gsd-verify-work` before reporting done — do not wait for a dashboard trigger." This rule now appears in all generated CLAUDE.md workflow sections.

- `/data/home/gsddashboard/.claude/get-shit-done/workflows/complete-milestone.md` — Inserted verification backstop block (D-05) at the top of the `pre_close_artifact_audit` step. The backstop detects the most recently executed phase, checks for a UAT.md, and surfaces a warning with continue/verify-first options if no verification record is found.

## Verification

- `profile-output.cjs` passes Node.js require (syntax OK)
- `generate-claude-md` output includes the new rule line
- `complete-milestone.md` contains all backstop markers (`MOST_RECENT_PHASE`, `UAT_FILE`, `no verification record`)
- `audit-open` reference still present in complete-milestone.md (at line 92, after the backstop)
- `execute-phase.md` was not modified
