---
phase: 56B
plan: "03"
subsystem: non-programmer-contract
tags: [eval-rubric, user-testing, non-programmer-contract, behavioural-contract]
dependency_graph:
  requires: [56B-01]
  provides: [eval-rubric-20-prompts, npb-07-test-plan]
  affects: [non-programmer-contract-compliance]
tech_stack:
  added: []
  patterns: [violation-type-taxonomy, scenario-based-testing]
key_files:
  created:
    - .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md
    - .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md
  modified: []
decisions:
  - "20 eval prompts organised into 8 categories matching the 12 violation types from the Non-Programmer Contract table"
  - "LEAVE-CONFIG violation type included in rubric taxonomy but not mapped to a dedicated prompt — covered as part of EDIT-FILE and MANUAL-STEP prompts"
  - "NPB-07 marked human_needed: true — requires live tester session with Emily-Kate or equivalent; cannot be automated"
  - "Calibration 3 graded as borderline PASS to clarify the acceptable boundary: making a decision plus asking permission to proceed is not a violation"
metrics:
  duration: "~4 minutes"
  completed: "2026-05-28"
  tasks_completed: 2
  files_modified: 2
requirements_completed: [NPB-04, NPB-07]
---

# Phase 56B Plan 03: Behavioural Eval Rubric and NPB-07 Test Plan Summary

**One-liner:** 20-prompt violation-typed eval rubric (12 violation categories, 3 calibration examples) plus human-gated NPB-07 test plan with 3 concrete real-project scenarios.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create 20-prompt behavioural eval rubric | eee49a1 | `.planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md` |
| 2 | Create NPB-07-TEST-PLAN.md with 3 concrete scenarios | 0324a94 | `.planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md` |

## Verification

**56B-EVAL-RUBRIC.md:**
- 20 eval prompts confirmed (`grep -c "^\*\*E-"` = 20)
- 21 violation_type labels (E-06 has a dual type: EDIT-FILE / CRED-TERMINAL)
- 49 PASS/FAIL lines across prompts and calibration examples
- All 12 violation codes present at least once
- 268 lines (well above 100-line minimum)
- 3 calibration examples (FAIL, PASS, borderline PASS)

**NPB-07-TEST-PLAN.md:**
- `human_needed: true` present in frontmatter
- 3 scenarios confirmed
- 13 stall signal lines (above 10-line minimum)
- Emily-Kate tester reference present
- Recording results table present

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Both files contain complete, concrete content with no placeholder text.

## Threat Flags

None. Both files are plain-text advisory documents with no network surface, no secrets, and no trust-boundary crossings. Project names (ynab, debates) are internal references with no PII.

## Self-Check

- [x] `.planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md` exists (268 lines)
- [x] `.planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md` exists
- [x] Commit eee49a1 exists (Task 1)
- [x] Commit 0324a94 exists (Task 2)

## Self-Check: PASSED
