---
phase: 56B-non-programmer-behavioural-contract
verified: 2026-05-28T08:30:00Z
status: human_needed
score: 6/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run Scenario 1 (debates RSS feature) from NPB-07-TEST-PLAN.md with Emily-Kate or equivalent non-programmer"
    expected: "Tester sends 1 message; Claude completes feature end-to-end without asking tester to read code, run commands, paste output, or perform any manual step"
    why_human: "Cannot automate — requires a live non-programmer tester who has no terminal access; stall detection requires observing actual Claude behaviour in a fresh session"
  - test: "Run Scenario 2 (YNAB email fix) from NPB-07-TEST-PLAN.md"
    expected: "Tester sends 1 message; Claude investigates logs, identifies root cause in plain English, fixes config/code, verifies fix, reports done — no handoffs"
    why_human: "Requires live tester + real broken YNAB state; cannot simulate authentically in automated test"
  - test: "Run Scenario 3 (new daily Todoist Telegram project) from NPB-07-TEST-PLAN.md"
    expected: "Tester sends 1 message; Claude uses Global Env Editor for credentials, never asks for API keys in terminal, deploys and confirms test message received"
    why_human: "Requires real Telegram bot, real Todoist PAT, and real non-programmer tester to observe credential handling — cannot simulate"
---

# Phase 56B: Non-Programmer Behavioural Contract — Verification Report

**Phase Goal:** Establish a Non-Programmer Behavioural Contract — a machine-enforceable set of rules specifying what Claude must never say/do when working with a non-programmer user, and corresponding replacements. Inject the contract into CLAUDE.md files and GSD workflows, and create an evaluation rubric for regression testing.
**Verified:** 2026-05-28T08:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GSD template (claude-md.md) contains Non-Programmer Contract section with GSD markers | VERIFIED | `grep -c "GSD:non-programmer-contract-start" /home/claude/.claude/get-shit-done/templates/claude-md.md` = 1; 12-row forbidden→replacement table present |
| 2 | All 5 target project CLAUDE.md files contain the injected contract | VERIFIED | All 5 files return count=1 for `GSD:non-programmer-contract-start`; debates, ynab, KidAI, zoho-todoist-sync, reforma all confirmed |
| 3 | discuss-phase.md contains user-outcome framing rule in its purpose block | VERIFIED | `grep "Non-Programmer Rule"` returns 1 match; `awk '/<purpose>/,/<\/purpose>/'` confirms rule is inside `<purpose>` block |
| 4 | plan-phase.md contains user-outcome framing rule in its purpose block | VERIFIED | `grep "Non-Programmer Rule"` returns 1 match; `awk '/<purpose>/,/<\/purpose>/'` confirms rule is inside `<purpose>` block |
| 5 | 56B-EVAL-RUBRIC.md exists with 20 prompts, all 12 violation types, and 3 calibration examples | VERIFIED | 268 lines; `grep -c "^\*\*E-"` = 20; all 12 violation types present; 3 calibration sections found |
| 6 | NPB-07-TEST-PLAN.md exists with 3 concrete scenarios and human_needed marker | VERIFIED | `human_needed: true` in frontmatter; `grep -c "^## Scenario"` = 3; Emily-Kate reference present; 3 stall signal sections |
| 7 | Non-programmer contract enforcement is verified with a real non-programmer (NPB-07) | REQUIRES HUMAN | User testing checkpoint with Emily-Kate has not been executed — cannot automate |

**Score:** 6/7 truths verified (1 requires human)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `/home/claude/.claude/get-shit-done/templates/claude-md.md` | Contract section with GSD markers between Workflow Enforcement and Profile | VERIFIED | Marker at line 109; profile section starts at line 133; correct ordering confirmed |
| `/home/services/debates/CLAUDE.md` | Contract injected with GSD markers | VERIFIED | 1 start marker, 1 end marker; table rows confirmed (Global Env Editor, paste git diffs) |
| `/home/services/reforma/CLAUDE.md` | Contract injected with GSD markers | VERIFIED | 1 start marker present on disk (no git repo — disk-only change, per plan) |
| `/home/services/ynab/CLAUDE.md` | Contract + Verbosity Contract backfill | VERIFIED | 1 start marker; Verbosity Contract present (count=1) |
| `/home/services/KidAI/CLAUDE.md` | Contract injected with GSD markers | VERIFIED | 1 start marker |
| `/home/services/zoho-todoist-sync/CLAUDE.md` | Contract injected with GSD markers | VERIFIED | 1 start marker; Deploy started row confirmed |
| `/home/claude/.claude/get-shit-done/workflows/discuss-phase.md` | Non-Programmer Rule in purpose block | VERIFIED | Rule present at line 6 inside `<purpose>` block; user-outcome language confirmed |
| `/home/claude/.claude/get-shit-done/workflows/plan-phase.md` | Non-Programmer Rule in purpose block | VERIFIED | Rule present inside `<purpose>` block; checkpoint:decision language confirmed |
| `.planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md` | 20-prompt eval rubric, 12 violation types, 3 calibration examples, ≥100 lines | VERIFIED | 268 lines; 20 prompts; all 12 violation types; 3 calibration entries |
| `.planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md` | 3 scenarios, human_needed marker | VERIFIED | human_needed: true in frontmatter; 3 scenarios; 3 stall signal sections; Emily-Kate named |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `templates/claude-md.md` | Project CLAUDE.md files | GSD marker pattern `<!-- GSD:non-programmer-contract-start source:templates/claude-md.md -->` | VERIFIED | All 6 files (template + 5 projects) use identical marker format with `source:templates/claude-md.md` attribute |
| `discuss-phase.md` purpose block | Questions asked to user | Non-Programmer Rule preamble enforced before any AskUserQuestion call | VERIFIED | Rule is inside `<purpose>` block — read at workflow load time before any question step |
| `plan-phase.md` purpose block | checkpoint:decision tasks | Non-Programmer Rule enforced when framing checkpoint questions | VERIFIED | Rule inside `<purpose>` block; explicitly references `checkpoint:decision` tasks |
| `56B-EVAL-RUBRIC.md` | Non-Programmer Contract forbidden table | Each eval prompt maps to 1-2 rows of the forbidden→replacement table | VERIFIED | All 12 violation type codes present; E-06 covers dual type EDIT-FILE/CRED-TERMINAL |

---

### Data-Flow Trace (Level 4)

Not applicable — all deliverables are static configuration files (CLAUDE.md text, workflow rules, eval rubric). No dynamic data sources.

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — these are behavioural governance documents (CLAUDE.md files, workflow rules). There is no runnable entry point. Compliance is verified by live session testing (NPB-07), which requires a human.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NPB-01 | 56B-01 | Global CLAUDE.md template contains explicit "Do not ask the user to…" section | SATISFIED | Template contains 12-row forbidden→replacement table with GSD markers |
| NPB-02 | 56B-02 | GSD discuss-phase and plan-phase don't surface implementation-level questions | SATISFIED | Non-Programmer Rule in purpose block of both workflows enforces user-outcome framing |
| NPB-03 | 56B-01 | Claude/GSD completes end-to-end before pinging user — no "deploy started, check back" handoffs | SATISFIED | "Deploy started, check back in a few minutes" row in contract table across all 6 files |
| NPB-04 | 56B-03 | Behavioural eval set of 20 prompts graded for violations | SATISFIED | 56B-EVAL-RUBRIC.md: 20 prompts, 12 violation types, 3 calibration examples, 268 lines |
| NPB-05 | 56B-02 | Questions framed in user-outcome language, not jargon | SATISFIED | Non-Programmer Rule in both workflow purpose blocks explicitly bans jargon framing |
| NPB-06 | 56B-01 | Missing credentials surfaced via Dashboard panel, not terminal | SATISFIED | "Asking user to paste an API key in the terminal → Global Env Editor panel" row in all 6 contract files |
| NPB-07 | 56B-03 | User-testing checkpoint with genuine non-programmer, 3 real tasks | NEEDS HUMAN | NPB-07-TEST-PLAN.md created and marked human_needed; testing with Emily-Kate not yet executed |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | — |

No TODOs, placeholders, empty implementations, or stub patterns found in any of the 10 delivered artifacts.

---

### Human Verification Required

#### 1. NPB-07 Scenario 1 — Add Feature (Debates RSS)

**Test:** Send "I want the debates RSS feed to also include a description of each debate in the podcast app." to a fresh Claude Code session on the debates project. Tester must have no terminal access.
**Expected:** Claude reads RSS generator code itself, finds/reads API docs, writes + tests + deploys the change end-to-end, confirms the feature is live. Tester completes the task with 1 message.
**Why human:** Requires a genuine non-programmer tester to observe whether any stall occurs. Stall detection is a social/UX observation — cannot be automated. A live session with real Claude behaviour is required.

#### 2. NPB-07 Scenario 2 — Fix Broken Email (YNAB)

**Test:** Send "The YNAB app stopped sending me the weekly budget summary email. Can you fix it?" to Claude Code on the ynab project. Tester must have no terminal access.
**Expected:** Claude reads logs, diagnoses root cause (in plain English), fixes config/code, triggers a test send, confirms delivery. No handoffs to user.
**Why human:** Requires a broken real-world state in YNAB and a non-programmer tester observing Claude's investigation pattern. Cannot simulate authentically.

#### 3. NPB-07 Scenario 3 — Start New Project (Todoist Telegram)

**Test:** Send "I want to start a new project that sends me a daily Telegram message with my top 3 tasks for the day from Todoist." Tester observes how Claude handles credential collection.
**Expected:** Claude uses Global Env Editor (Dashboard panel) for API keys — never asks for Todoist PAT or Telegram bot token in the terminal. Deploys and confirms a test message arrives.
**Why human:** Requires real Telegram bot + Todoist PAT + non-programmer tester to verify credential handling behaviour. NPB-07-TEST-PLAN.md status: pending.

---

### Gaps Summary

No automated gaps found. All artifacts exist, are substantive, and are correctly wired. The single outstanding item (NPB-07 live user testing) is a human verification requirement by design — the test plan explicitly marks it `human_needed: true` and requires a live session with Emily-Kate or equivalent.

The phase goal is structurally complete: contract is injected, workflows are updated, eval rubric is ready. The remaining step is executing the user testing checkpoint documented in NPB-07-TEST-PLAN.md.

---

_Verified: 2026-05-28T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
