---
phase: 56B
plan: "02"
subsystem: gsd-workflows
tags: [non-programmer-contract, gsd-workflows, question-framing, behavioral-rules]
dependency_graph:
  requires: [56B-01]
  provides: [non-programmer-framing-rule-in-discuss-phase, non-programmer-framing-rule-in-plan-phase]
  affects: [discuss-phase-workflow, plan-phase-workflow]
tech_stack:
  added: []
  patterns: [purpose-block-injection, user-outcome-framing]
key_files:
  created: []
  modified:
    - /home/claude/.claude/get-shit-done/workflows/discuss-phase.md
    - /home/claude/.claude/get-shit-done/workflows/plan-phase.md
    - /data/home/.claude/get-shit-done/workflows/discuss-phase.md
    - /data/home/.claude/get-shit-done/workflows/plan-phase.md
decisions:
  - "Non-Programmer Rule injected into <purpose> block of both discuss-phase.md and plan-phase.md"
  - "Both the /home/claude and /data/home GSD installs updated for consistency (symlink-linked installs)"
  - "Workflow files are outside any git repository — changes saved on disk only (same precedent as plan 01)"
metrics:
  duration: "~7 minutes"
  completed: "2026-05-28"
  tasks_completed: 2
  files_modified: 4
requirements_completed: [NPB-02, NPB-05]
---

# Phase 56B Plan 02: GSD Workflow Question-Framing Rules Summary

**One-liner:** Non-Programmer Rule injected into the `<purpose>` block of discuss-phase.md and plan-phase.md, governing user-outcome question framing in both discussion and planning workflows.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add user-outcome framing rule to discuss-phase workflow | (external file — no git commit) | discuss-phase.md (2 installs) |
| 2 | Add user-outcome framing rule to plan-phase workflow | (external file — no git commit) | plan-phase.md (2 installs) |

## What Was Built

Both GSD workflow files now contain a governing rule in their `<purpose>` block:

**discuss-phase.md rule:**
> When asking the user questions, always frame them in user-outcome terms ("What should happen when X?", "How do you want users to experience Y?") — never in implementation terms ("Which database?", "REST or GraphQL?", "Should we use Redis?"). If a question requires implementation knowledge to answer, Claude decides and states the choice in plain English.

**plan-phase.md rule:**
> When creating `checkpoint:decision` tasks or surfacing any question to the user, frame it in user-outcome terms ("Should the feed show the last 10 items or all items?") — never in implementation terms ("Should we use cursor-based pagination or offset pagination?"). If the decision is purely technical and has no user-visible consequence, Claude decides and documents the choice in the task action.

## Verification

```
grep "Non-Programmer Rule" /home/claude/.claude/get-shit-done/workflows/discuss-phase.md
# -> 1 match

grep "user-outcome" /home/claude/.claude/get-shit-done/workflows/discuss-phase.md
# -> 1 match

awk '/<purpose>/,/<\/purpose>/' /home/claude/.claude/get-shit-done/workflows/discuss-phase.md | grep "Non-Programmer Rule"
# -> 1 match (rule is inside the purpose block)

grep "Non-Programmer Rule" /home/claude/.claude/get-shit-done/workflows/plan-phase.md
# -> 1 match

grep "user-outcome" /home/claude/.claude/get-shit-done/workflows/plan-phase.md
# -> 1 match

awk '/<purpose>/,/<\/purpose>/' /home/claude/.claude/get-shit-done/workflows/plan-phase.md | grep "Non-Programmer Rule"
# -> 1 match (rule is inside the purpose block)
```

All acceptance criteria met. Existing content in both files preserved.

## Deviations from Plan

### External File Handling (precedent from Plan 01)

Both target files (`/home/claude/.claude/get-shit-done/workflows/`) exist outside any git repository. Following the same precedent established in Plan 01 (where `/home/claude/.claude/get-shit-done/templates/claude-md.md` was similarly outside git), changes are saved on disk only with no individual task commits.

Additionally, the `/data/home/.claude/get-shit-done/` install (used by project symlinks) was updated with the same rules to ensure consistency across GSD installations on this machine.

## Known Stubs

None. These are governing rules injected into workflow preambles — no data sources required.

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced. Changes are developer-owned config files (workflow prompt text) with no untrusted write path.

## Self-Check: PASSED

- discuss-phase.md Non-Programmer Rule: present at line 6 (inside `<purpose>` block)
- plan-phase.md Non-Programmer Rule: present at line 4 (inside `<purpose>` block)
- Both /home/claude and /data/home installs updated
- No existing content removed from either file
- Both rules include concrete compliant vs forbidden examples
