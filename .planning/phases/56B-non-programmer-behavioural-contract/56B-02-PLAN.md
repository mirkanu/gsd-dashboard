---
phase: 56B
plan: 02
type: execute
wave: 2
depends_on:
  - 56B-01
files_modified:
  - /home/claude/.claude/get-shit-done/workflows/discuss-phase.md
  - /home/claude/.claude/get-shit-done/workflows/plan-phase.md
autonomous: true
requirements:
  - NPB-02
  - NPB-05

must_haves:
  truths:
    - "discuss-phase workflow contains a one-sentence rule instructing question framing in user-outcome terms, not implementation terms"
    - "plan-phase workflow contains a one-sentence rule instructing question framing in user-outcome terms, not implementation terms"
    - "Both rules are positioned at the top of their respective files near the purpose/philosophy section"
  artifacts:
    - path: "/home/claude/.claude/get-shit-done/workflows/discuss-phase.md"
      provides: "Non-programmer question framing rule in preamble"
      contains: "user-outcome"
    - path: "/home/claude/.claude/get-shit-done/workflows/plan-phase.md"
      provides: "Non-programmer question framing rule in preamble"
      contains: "user-outcome"
  key_links:
    - from: "discuss-phase workflow"
      to: "questions asked to user"
      via: "preamble rule enforced before any AskUserQuestion call"
      pattern: "user-outcome.*not.*implementation\|jargon"
    - from: "plan-phase workflow"
      to: "checkpoint:decision tasks"
      via: "preamble rule applied when framing checkpoint questions"
      pattern: "user-outcome.*not.*implementation\|jargon"
---

<objective>
Add a user-outcome question framing rule to the discuss-phase and plan-phase GSD skill workflows, ensuring that questions surfaced to the user are always framed in terms of what they want to achieve — never in implementation or jargon terms.

Purpose: NPB-02 and NPB-05 require that GSD workflows don't surface programmer-level questions to the user. Discuss-phase captures decisions; plan-phase creates checkpoints. Both need a governing rule.

Output: Two updated workflow files, each with a one-sentence preamble addition that enforces user-outcome question framing.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/56B-non-programmer-behavioural-contract/56B-CONTEXT.md
@.planning/phases/56B-non-programmer-behavioural-contract/56B-01-SUMMARY.md

<interfaces>
<!-- discuss-phase.md structure (first 60 lines): -->
<!-- Line 1: <purpose> block -->
<!--   "Extract implementation decisions..." -->
<!--   "You are a thinking partner, not an interviewer..." -->
<!-- Line ~10: </purpose> -->
<!-- Line ~12: <required_reading> block -->
<!-- Line ~20: </required_reading> -->
<!-- Line ~22: <progressive_disclosure> block -->
<!-- ... -->

<!-- plan-phase.md structure (first 60 lines): -->
<!-- Line 1: <purpose> block -->
<!--   "Create executable phase prompts (PLAN.md files)..." -->
<!-- Line ~5: </purpose> -->
<!-- Line ~7: <required_reading> block -->
<!-- ... -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add user-outcome framing rule to discuss-phase workflow</name>
  <files>/home/claude/.claude/get-shit-done/workflows/discuss-phase.md</files>
  <read_first>
    - /home/claude/.claude/get-shit-done/workflows/discuss-phase.md (read lines 1-60 to find the <purpose> block and the best insertion point near the top)
  </read_first>
  <action>
Read `/home/claude/.claude/get-shit-done/workflows/discuss-phase.md` lines 1-60 first. Find the `<purpose>` block (appears at the top of the file).

Inside the `<purpose>` block, after the existing content (which ends with "Your job is to capture decisions that will guide research and planning, not to figure out implementation yourself."), add a blank line and then the following sentence:

```
**Non-Programmer Rule:** When asking the user questions, always frame them in user-outcome terms ("What should happen when X?", "How do you want users to experience Y?") — never in implementation terms ("Which database?", "REST or GraphQL?", "Should we use Redis?"). If a question requires implementation knowledge to answer, Claude decides and states the choice in plain English.
```

The exact insertion point is: append to the existing `<purpose>` block content, before the closing `</purpose>` tag.
  </action>
  <verify>
    <automated>grep "Non-Programmer Rule" /home/claude/.claude/get-shit-done/workflows/discuss-phase.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep "Non-Programmer Rule" /home/claude/.claude/get-shit-done/workflows/discuss-phase.md` returns 1 match
    - `grep "user-outcome" /home/claude/.claude/get-shit-done/workflows/discuss-phase.md` returns at least 1 match
    - `grep "implementation terms\|jargon" /home/claude/.claude/get-shit-done/workflows/discuss-phase.md` returns at least 1 match
    - The rule appears within the `<purpose>` block (verify: `awk '/<purpose>/,/<\/purpose>/' /home/claude/.claude/get-shit-done/workflows/discuss-phase.md | grep "Non-Programmer Rule"` returns a match)
    - All existing content in discuss-phase.md is preserved (file line count increased by ~2-3 lines compared to original)
  </acceptance_criteria>
  <done>discuss-phase.md contains the Non-Programmer Rule inside its purpose block, instructing question framing in user-outcome terms.</done>
</task>

<task type="auto">
  <name>Task 2: Add user-outcome framing rule to plan-phase workflow</name>
  <files>/home/claude/.claude/get-shit-done/workflows/plan-phase.md</files>
  <read_first>
    - /home/claude/.claude/get-shit-done/workflows/plan-phase.md (read lines 1-60 to find the <purpose> block and the best insertion point)
  </read_first>
  <action>
Read `/home/claude/.claude/get-shit-done/workflows/plan-phase.md` lines 1-60 first. Find the `<purpose>` block (appears at the top of the file).

Inside the `<purpose>` block, after the existing content, add a blank line and then the following sentence:

```
**Non-Programmer Rule:** When creating `checkpoint:decision` tasks or surfacing any question to the user, frame it in user-outcome terms ("Should the feed show the last 10 items or all items?") — never in implementation terms ("Should we use cursor-based pagination or offset pagination?"). If the decision is purely technical and has no user-visible consequence, Claude decides and documents the choice in the task action.
```

The exact insertion point is: append to the existing `<purpose>` block content, before the closing `</purpose>` tag.
  </action>
  <verify>
    <automated>grep "Non-Programmer Rule" /home/claude/.claude/get-shit-done/workflows/plan-phase.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep "Non-Programmer Rule" /home/claude/.claude/get-shit-done/workflows/plan-phase.md` returns 1 match
    - `grep "user-outcome" /home/claude/.claude/get-shit-done/workflows/plan-phase.md` returns at least 1 match
    - `grep "checkpoint:decision" /home/claude/.claude/get-shit-done/workflows/plan-phase.md` returns matches (existing content intact)
    - The rule appears within the `<purpose>` block (verify: `awk '/<purpose>/,/<\/purpose>/' /home/claude/.claude/get-shit-done/workflows/plan-phase.md | grep "Non-Programmer Rule"` returns a match)
    - `grep "Create executable phase prompts" /home/claude/.claude/get-shit-done/workflows/plan-phase.md` returns 1 match (existing first line of purpose block preserved)
  </acceptance_criteria>
  <done>plan-phase.md contains the Non-Programmer Rule inside its purpose block, instructing checkpoint:decision tasks to use user-outcome framing.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GSD workflow files → Claude agent execution | Workflow files are read as prompts by Claude agents — injected rules govern agent behaviour |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-56B-04 | Tampering | discuss-phase.md / plan-phase.md | accept | Developer-owned config files; no untrusted write path; changes are version-controlled |
| T-56B-05 | Denial of Service | Overly restrictive preamble causing discuss-phase to refuse legitimate questions | mitigate | Rule includes explicit escape hatch: "if truly stuck, framed in plain English" — legitimate technical blocks can still be surfaced |
</threat_model>

<verification>
After both tasks complete:

```bash
# Verify discuss-phase updated
grep "Non-Programmer Rule" /home/claude/.claude/get-shit-done/workflows/discuss-phase.md
grep "user-outcome" /home/claude/.claude/get-shit-done/workflows/discuss-phase.md

# Verify plan-phase updated
grep "Non-Programmer Rule" /home/claude/.claude/get-shit-done/workflows/plan-phase.md
grep "user-outcome" /home/claude/.claude/get-shit-done/workflows/plan-phase.md

# Verify rules are inside <purpose> blocks
awk '/<purpose>/,/<\/purpose>/' /home/claude/.claude/get-shit-done/workflows/discuss-phase.md | grep "Non-Programmer Rule"
awk '/<purpose>/,/<\/purpose>/' /home/claude/.claude/get-shit-done/workflows/plan-phase.md | grep "Non-Programmer Rule"
```

Both files must contain the Non-Programmer Rule inside the purpose block.
</verification>

<success_criteria>
- discuss-phase.md purpose block contains Non-Programmer Rule with "user-outcome terms" and "implementation terms" language
- plan-phase.md purpose block contains Non-Programmer Rule referencing checkpoint:decision tasks and user-outcome framing
- Neither file has had existing content removed or modified
- Both rules include concrete examples of compliant vs forbidden question phrasing
</success_criteria>

<output>
After completion, create `.planning/phases/56B-non-programmer-behavioural-contract/56B-02-SUMMARY.md`
</output>
