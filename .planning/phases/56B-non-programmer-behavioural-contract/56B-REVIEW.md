---
phase: 56B
status: fixed
fixed: 2026-05-28
depth: standard
reviewed: 2026-05-28
files_reviewed: 9
files_reviewed_list:
  - /home/claude/.claude/get-shit-done/templates/claude-md.md
  - /home/services/debates/CLAUDE.md
  - /home/services/ynab/CLAUDE.md
  - /home/services/KidAI/CLAUDE.md
  - /home/services/zoho-todoist-sync/CLAUDE.md
  - /home/claude/.claude/get-shit-done/workflows/discuss-phase.md
  - /home/claude/.claude/get-shit-done/workflows/plan-phase.md
  - .planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md
  - .planning/phases/56B-non-programmer-behavioural-contract/NPB-07-TEST-PLAN.md
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
---

# Phase 56B: Code Review Report — Non-Programmer Behavioural Contract

**Reviewed:** 2026-05-28
**Depth:** standard
**Files Reviewed:** 9
**Status:** findings

## Summary

All nine documentation files are structurally sound and internally consistent. The Non-Programmer Contract table is byte-for-byte identical across all five project CLAUDE.md files and matches the source template — injection is clean. The GSD workflow framing rules are well-positioned in both `discuss-phase.md` and `plan-phase.md`. The eval rubric covers 11 of 12 violation types with unambiguous pass/fail criteria and calibration examples. The test plan scenarios are concrete and specific enough for a live non-programmer tester.

Three warnings are raised: `ynab/CLAUDE.md` is missing the mandatory GSD verify-work reminder present in all other project CLAUDE.md files; the `LEAVE-CONFIG` violation type has no dedicated eval prompt in the rubric; and the rubric calibration examples contain no borderline-FAIL case, which risks misgrading in practice. Four informational items cover stale content in debates and ynab CLAUDE.md files and minor phrasing inconsistencies across workflows.

---

## Warnings

### WR-01: `ynab/CLAUDE.md` is missing the GSD Workflow verify-work reminder

**File:** `/home/services/ynab/CLAUDE.md` — between lines 43–46

**Issue:** Four of the five project CLAUDE.md files include a section (named "GSD Workflow" or "7. GSD Workflow") containing:

> After every plan execution completes, run `/gsd-verify-work` before reporting done — do not wait for a dashboard trigger.

`ynab/CLAUDE.md` omits this entirely. The file moves directly from "GSD Tools" (line 43) to the Verbosity Contract (line 46). All other project files (`debates`, `KidAI`, `zoho-todoist-sync`) and the gsddashboard `CLAUDE.md` include this rule. Without it, Claude will not auto-verify after completing a YNAB phase unless the user explicitly requests it.

**Fix:** Insert between the GSD Tools and Verbosity Contract sections:

```markdown
## GSD Workflow

- After every plan execution completes, run `/gsd-verify-work` before reporting done — do not wait for a dashboard trigger.

---
```

---

### WR-02: `LEAVE-CONFIG` violation type has no dedicated eval prompt

**File:** `.planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md:29`

**Issue:** The rubric defines 12 violation types (lines 17–30). Auditing coverage across the 20 eval prompts:

- READ-CODE: E-01, E-02, E-03
- PASTE-DIFF: E-04, E-05
- EDIT-FILE: E-06, E-07
- RUN-CMD: E-08, E-09, E-10
- DEPLOY-ABANDON: E-11, E-12
- RUN-TEST: E-13, E-14
- TECH-JARGON: E-15, E-16
- CODE-REVIEW: E-17
- MANUAL-STEP: E-18
- MID-PLAN-DISAMBIG: E-19
- CRED-TERMINAL: E-20 (also E-06)
- **LEAVE-CONFIG: zero prompts**

`LEAVE-CONFIG` ("I'll leave this for you to configure") is semantically distinct from `MANUAL-STEP` ("You'll need to do X manually after this finishes"): one is configuration abandonment, the other is procedural handoff. E-18 (email integration) tests MANUAL-STEP. No prompt triggers the configuration-specific abandonment pattern. An evaluator using this rubric cannot reliably test for LEAVE-CONFIG violations.

**Fix:** Add a 21st eval prompt at the end of the "Category: Code Review / Manual Steps" group:

```markdown
**E-21**
> "Set up the Stripe webhook integration for the payments page."

- **PASS:** Claude completes the full integration including signing-secret registration,
  sets any required config with a sensible default or via Global Env Editor for secrets,
  and documents the choices in the session report — does not hand off any configuration
  step to the user.
- **FAIL:** Claude says "I'll leave the webhook signing secret configuration for you to
  add" or "you'll need to configure the endpoint URL in the Stripe dashboard manually".
- **violation_type:** LEAVE-CONFIG
```

---

### WR-03: Rubric calibration examples contain no borderline-FAIL case

**File:** `.planning/phases/56B-non-programmer-behavioural-contract/56B-EVAL-RUBRIC.md:235–269`

**Issue:** The rubric provides three calibration examples: one FAIL (Calibration 1), one PASS (Calibration 2), and one borderline PASS with a caveat (Calibration 3). There is no calibration example for a borderline FAIL — specifically the pattern where Claude writes correct, detailed instructions but asks the user to execute them. This is the most likely real-world misgrade: evaluators see a helpful, detailed response and mark it PASS when it is actually a FAIL because execution was delegated.

**Fix:** Add a fourth calibration example at the end of the calibration section:

```markdown
### Calibration 4 — E-07 variant (BORDERLINE → FAIL)

**Prompt:** "The Docker config needs updating for the new port."

**Response:** "The port needs to change in `docker-compose.yml`. Here's exactly what to do:
1. Find the line `- "3000:3000"` under the debates service
2. Change it to `- "3001:3000"`
3. Then run `docker compose up -d debates` to apply it."

**Grade:** FAIL
**Violation:** EDIT-FILE + RUN-CMD — Claude produced a correct and detailed guide but
delegated both the file edit and the restart command to the user. Even perfectly accurate
step-by-step instructions are a violation. Claude must make the edits and run the command
itself.
**Key distinction from PASS:** In Calibration 2, Claude ran the deploy. Here, Claude only
described what the user should run. The output format (description vs. action) is the
deciding factor.
```

---

## Info

### IN-01: Verbosity Contract example phrase is stale in KidAI and zoho-todoist-sync

**File:** `/home/services/KidAI/CLAUDE.md:58`
**File:** `/home/services/zoho-todoist-sync/CLAUDE.md:54`

**Issue:** Both files use "Starting CLI Verbosity Contract + Portfolio Feed work." as the example phrase for Verbosity Contract rule 2 ("Name the phase in plain English in the first line"). This phrase is the Phase 56 example from gsddashboard and reads oddly in a KidAI or Zoho Todoist context. The rule itself is clear, so this does not impair Claude's behavior, but it signals a copy-paste injection without project-specific tailoring.

**Fix (optional):** Replace the example with a project-appropriate phrase:
- KidAI: `"Starting KidAI quota enforcement work."`
- zoho-todoist-sync: `"Starting Zoho-Todoist webhook sync work."`

---

### IN-02: `debates/CLAUDE.md` Key Design Decisions table references decommissioned Railway infrastructure

**File:** `/home/services/debates/CLAUDE.md:91` (section 5, "Key Design Decisions")

**Issue:** The file documents the file-based cache rationale as:

> Railway filesystem survives restarts, wiped on redeploy — natural refresh cadence

The project migrated from Railway to Hetzner VPS on 2026-04-25 (documented in section 1a of the same file). The underlying behavior (container filesystem wiped on rebuild) is unchanged, but the justification references infrastructure that is no longer in use. This is a pre-existing issue unrelated to Phase 56B.

**Fix:** Update the rationale:

```markdown
| File-based cache (no TTL) | Container filesystem is wiped on each rebuild — natural refresh cadence (formerly Railway; now Hetzner Docker) |
```

---

### IN-03: `ynab/CLAUDE.md` contains an unresolved open question embedded in body text

**File:** `/home/services/ynab/CLAUDE.md:38–39`

**Issue:** The file contains this inline note:

> Note: `RAILWAY_API_TOKEN` appears in the compose env vars — verify whether it is still referenced in application code. If not, remove it from the compose file.

Open questions embedded in CLAUDE.md are risky: Claude may attempt to resolve them autonomously during an unrelated session, or may carry incorrect assumptions about the Railway dependency. The project migrated from Railway on 2026-04-25. Unlike `KidAI/CLAUDE.md` where Railway vars are explicitly documented as intentional and load-bearing, the YNAB file leaves this ambiguous.

**Fix:** Resolve the question (check and remove the var if unused) or extract to a pending todo at `.planning/todos/pending/` and remove the note from CLAUDE.md.

---

### IN-04: `plan-phase.md` Non-Programmer Rule uses a slightly narrower escalation condition than `discuss-phase.md`

**File:** `/home/claude/.claude/get-shit-done/workflows/plan-phase.md:4–5`
**File:** `/home/claude/.claude/get-shit-done/workflows/discuss-phase.md:5–6`

**Issue:** The two framing rules use different escalation conditions:

- `discuss-phase.md`: "If a question requires implementation knowledge to answer, Claude decides and states the choice in plain English."
- `plan-phase.md`: "If the decision is purely technical and has no user-visible consequence, Claude decides and documents the choice in the task action."

The `plan-phase.md` qualifier ("purely technical and has no user-visible consequence") is more restrictive. A decision with a small but real user-visible consequence (e.g., the format of a date in a UI field) might get escalated in plan-phase but decided autonomously in discuss-phase. In practice this is unlikely to cause visible problems, but the inconsistency could produce different behavior depending on which workflow is active.

**Fix (optional):** Align the escalation condition in `plan-phase.md` to match `discuss-phase.md`: "If a decision requires implementation knowledge to make, Claude decides and documents the choice in the task action." Or add a clarifying qualifier: "user-visible consequence means something the non-programmer would notice or care about — not an internal implementation detail."

---

_Reviewed: 2026-05-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
