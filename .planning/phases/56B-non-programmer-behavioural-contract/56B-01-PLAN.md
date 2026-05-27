---
phase: 56B
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - /home/claude/.claude/get-shit-done/templates/claude-md.md
  - /home/services/debates/CLAUDE.md
  - /home/services/reforma/CLAUDE.md
  - /home/services/ynab/CLAUDE.md
  - /home/services/KidAI/CLAUDE.md
  - /home/services/zoho-todoist-sync/CLAUDE.md
autonomous: true
requirements:
  - NPB-01
  - NPB-03
  - NPB-06

must_haves:
  truths:
    - "The global CLAUDE.md template contains a 'Non-Programmer Contract' section with a forbidden→replacement table"
    - "The section is bounded by GSD markers: <!-- GSD:non-programmer-contract-start --> / <!-- GSD:non-programmer-contract-end -->"
    - "The section appears after the Workflow Enforcement section in the template"
    - "All 5 project CLAUDE.md files contain the Non-Programmer Contract section after their Verbosity Contract section"
    - "The forbidden→replacement table covers: reading code, pasting diffs, editing files/env, running commands, deploy handoffs, running tests, technical architecture questions, reviewing code before commit, 'you'll need to do X manually', 'I'll leave this for you', technical disambiguation, asking for API key in terminal"
  artifacts:
    - path: "/home/claude/.claude/get-shit-done/templates/claude-md.md"
      provides: "Updated template with Non-Programmer Contract section and GSD markers"
      contains: "GSD:non-programmer-contract-start"
    - path: "/home/services/debates/CLAUDE.md"
      provides: "Non-Programmer Contract injected after Verbosity Contract"
      contains: "GSD:non-programmer-contract-start"
    - path: "/home/services/reforma/CLAUDE.md"
      provides: "Non-Programmer Contract injected after Verbosity Contract"
      contains: "GSD:non-programmer-contract-start"
    - path: "/home/services/ynab/CLAUDE.md"
      provides: "Non-Programmer Contract injected at end (no existing Verbosity section)"
      contains: "GSD:non-programmer-contract-start"
    - path: "/home/services/KidAI/CLAUDE.md"
      provides: "Non-Programmer Contract injected after Verbosity Contract"
      contains: "GSD:non-programmer-contract-start"
    - path: "/home/services/zoho-todoist-sync/CLAUDE.md"
      provides: "Non-Programmer Contract injected after Verbosity Contract"
      contains: "GSD:non-programmer-contract-start"
  key_links:
    - from: "/home/claude/.claude/get-shit-done/templates/claude-md.md"
      to: "project CLAUDE.md files"
      via: "GSD marker system — same source: attribute pattern as project/stack/workflow sections"
      pattern: "GSD:non-programmer-contract-start source:templates/claude-md.md"
---

<objective>
Add the Non-Programmer Contract section to the global CLAUDE.md template and inject it into all 5 existing project CLAUDE.md files.

Purpose: Enforce at the CLAUDE.md layer that Claude never asks the user to perform programmer actions — reading code, running commands, editing files, pasting diffs, or doing manual steps that Claude can do itself.

Output: Updated template file + 5 updated project CLAUDE.md files, all containing the forbidden→replacement table bounded by GSD markers.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/56B-non-programmer-behavioural-contract/56B-CONTEXT.md

<interfaces>
<!-- GSD marker format used in templates/claude-md.md -->
<!-- Start: <!-- GSD:{name}-start source:{file} --> -->
<!-- End:   <!-- GSD:{name}-end --> -->

<!-- Existing section order in claude-md.md: -->
<!-- 1. Project (GSD:project-start/end) -->
<!-- 2. Stack (GSD:stack-start/end) -->
<!-- 3. Conventions (GSD:conventions-start/end) -->
<!-- 4. Architecture (GSD:architecture-start/end) -->
<!-- 5. Skills (GSD:skills-start/end) -->
<!-- 6. Workflow Enforcement (GSD:workflow-start/end) -->
<!-- NEW: Non-Programmer Contract (GSD:non-programmer-contract-start/end) -->
<!-- 7. Profile (GSD:profile-start/end) -->

<!-- Project CLAUDE.md files and their Verbosity Contract status: -->
<!-- /home/services/debates/CLAUDE.md       — has Verbosity Contract at line 116, 124 lines total -->
<!-- /home/services/reforma/CLAUDE.md       — has Verbosity Contract at line 27, 35 lines total -->
<!-- /home/services/KidAI/CLAUDE.md         — has Verbosity Contract at line 53, 61 lines total -->
<!-- /home/services/zoho-todoist-sync/CLAUDE.md — has Verbosity Contract at line 49, 91 lines total -->
<!-- /home/services/ynab/CLAUDE.md          — NO Verbosity Contract, 43 lines total, ends at ## GSD Tools -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Non-Programmer Contract section to global CLAUDE.md template</name>
  <files>/home/claude/.claude/get-shit-done/templates/claude-md.md</files>
  <read_first>
    - /home/claude/.claude/get-shit-done/templates/claude-md.md (read in full — must understand current section ordering and marker format before editing)
  </read_first>
  <action>
Append a new section template to `/home/claude/.claude/get-shit-done/templates/claude-md.md` after the Workflow Enforcement section block and before the Profile Section block.

The section ordering comment (line 126 onwards) currently lists:
1. Project, 2. Stack, 3. Conventions, 4. Architecture, 5. Skills, 6. Workflow Enforcement, 7. Profile

Update the ordering comment to insert "7. Non-Programmer Contract" between Workflow Enforcement and Profile, and renumber Profile to 8.

Add the following template block between the Workflow Enforcement section and the Profile Section in the "Section Templates" part of the file:

```
### Non-Programmer Contract Section
```
<!-- GSD:non-programmer-contract-start source:templates/claude-md.md -->
## Non-Programmer Contract

Claude must never ask the user to perform a programmer action that Claude can do itself. Technical decisions are made by Claude using its own judgment, documented in the session report, and reversible by the user in plain English.

| Forbidden | Replacement |
|-----------|-------------|
| Asking user to open/view/read code | Read it yourself; summarise findings in plain English |
| Asking user to paste git diffs or logs | Read them yourself with `git diff`, `git log`, or file reads |
| Asking user to edit a config/.env/any file | Edit it yourself; use the Global Env Editor (Dashboard) if credentials are missing |
| Asking user to run a terminal command | Run it yourself |
| "Deploy started, check back in a few minutes" | Run the deploy, wait for it, verify it's live, then ping the user |
| Asking user to run the tests | Run them yourself; only report after they pass (or after a real failure needing a decision) |
| Asking user a technical architecture decision in jargon | Decide yourself; state the decision in plain English; offer to change course |
| Asking user to review code before commit | Commit yourself after verify-work passes |
| "You'll need to do X manually after this finishes" | Don't finish until X is done, or add X to the plan |
| "I'll leave this for you to configure" | Configure with a sensible default; document in the session report |
| Technical disambiguation questions mid-plan | Use CLAUDE.md defaults; only escalate if truly stuck, framed in plain English |
| Asking user to paste an API key in the terminal | Use the Global Env Editor panel (Dashboard) |
<!-- GSD:non-programmer-contract-end -->
```

Exact placement: after the closing ``` of the Workflow Enforcement section block, before the `### Profile Section (Placeholder Only)` heading.
  </action>
  <verify>
    <automated>grep -c "GSD:non-programmer-contract-start" /home/claude/.claude/get-shit-done/templates/claude-md.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep "GSD:non-programmer-contract-start" /home/claude/.claude/get-shit-done/templates/claude-md.md` returns exactly 1 match
    - `grep "GSD:non-programmer-contract-end" /home/claude/.claude/get-shit-done/templates/claude-md.md` returns exactly 1 match
    - `grep "Non-Programmer Contract" /home/claude/.claude/get-shit-done/templates/claude-md.md` returns at least 2 matches (heading + section ordering comment)
    - `grep "Forbidden.*Replacement\|Deploy started.*check back\|Global Env Editor" /home/claude/.claude/get-shit-done/templates/claude-md.md` returns matches
    - The section ordering list in the file shows the new section between "Workflow Enforcement" and "Profile"
    - `grep -n "non-programmer\|Profile" /home/claude/.claude/get-shit-done/templates/claude-md.md` shows non-programmer-contract-start appearing before profile-start
  </acceptance_criteria>
  <done>Template file contains the Non-Programmer Contract section with GSD markers, positioned between Workflow Enforcement and Profile, with the full 12-row forbidden→replacement table.</done>
</task>

<task type="auto">
  <name>Task 2: Inject Non-Programmer Contract into 5 project CLAUDE.md files</name>
  <files>
    /home/services/debates/CLAUDE.md
    /home/services/reforma/CLAUDE.md
    /home/services/ynab/CLAUDE.md
    /home/services/KidAI/CLAUDE.md
    /home/services/zoho-todoist-sync/CLAUDE.md
  </files>
  <read_first>
    - /home/services/debates/CLAUDE.md (read in full before editing — 124 lines, Verbosity Contract at line 116)
    - /home/services/reforma/CLAUDE.md (read in full before editing — 35 lines, Verbosity Contract at line 27)
    - /home/services/ynab/CLAUDE.md (read in full before editing — 43 lines, NO Verbosity Contract)
    - /home/services/KidAI/CLAUDE.md (read in full before editing — 61 lines, Verbosity Contract at line 53)
    - /home/services/zoho-todoist-sync/CLAUDE.md (read in full before editing — 91 lines, Verbosity Contract at line 49)
  </read_first>
  <action>
For each of the 5 project CLAUDE.md files, append the Non-Programmer Contract section at the end of the file (after all existing content). The section content is identical for all 5 files:

```
<!-- GSD:non-programmer-contract-start source:templates/claude-md.md -->
## Non-Programmer Contract

Claude must never ask the user to perform a programmer action that Claude can do itself. Technical decisions are made by Claude using its own judgment, documented in the session report, and reversible by the user in plain English.

| Forbidden | Replacement |
|-----------|-------------|
| Asking user to open/view/read code | Read it yourself; summarise findings in plain English |
| Asking user to paste git diffs or logs | Read them yourself with `git diff`, `git log`, or file reads |
| Asking user to edit a config/.env/any file | Edit it yourself; use the Global Env Editor (Dashboard) if credentials are missing |
| Asking user to run a terminal command | Run it yourself |
| "Deploy started, check back in a few minutes" | Run the deploy, wait for it, verify it's live, then ping the user |
| Asking user to run the tests | Run them yourself; only report after they pass (or after a real failure needing a decision) |
| Asking user a technical architecture decision in jargon | Decide yourself; state the decision in plain English; offer to change course |
| Asking user to review code before commit | Commit yourself after verify-work passes |
| "You'll need to do X manually after this finishes" | Don't finish until X is done, or add X to the plan |
| "I'll leave this for you to configure" | Configure with a sensible default; document in the session report |
| Technical disambiguation questions mid-plan | Use CLAUDE.md defaults; only escalate if truly stuck, framed in plain English |
| Asking user to paste an API key in the terminal | Use the Global Env Editor panel (Dashboard) |
<!-- GSD:non-programmer-contract-end -->
```

Append this block to the end of each file with a preceding blank line for readability. Do NOT modify any existing content in the files — pure append only.

For ynab/CLAUDE.md specifically: also append the Verbosity Contract section first (since it is missing from that file), then append the Non-Programmer Contract. The Verbosity Contract content to append to ynab/CLAUDE.md:

```
## Verbosity Contract

These rules apply to every terminal session in this project. They reduce what Claude says in the terminal so the tmux pane stays readable.

1. **Skip CONTEXT.md interrogation when CONTEXT.md already exists.** If `.planning/phases/{phase}/{phase}-CONTEXT.md` is present, do not re-interview the user about the phase — proceed directly to planning.
2. **Name the phase in plain English in the first line of the session report.** Instead of "I will now begin Phase 3", write "Starting YNAB email automation work." One line, present tense, specific.
3. **Don't repeat what the user just said.** If the user said "plan phase 3", do not echo back "You asked me to plan phase 3." Begin the work.
4. **Prefer one-line status updates.** Instead of a paragraph explaining what you are about to do, emit a single line: "Reading roadmap." "Writing plan 01." "Done." Reserve multi-line output for actual results (lists of tasks, file paths, errors).
5. **Active voice, present tense.** Write "Creating handler.ts" not "handler.ts will be created" and not "I am in the process of creating handler.ts".
```
  </action>
  <verify>
    <automated>for f in /home/services/debates/CLAUDE.md /home/services/reforma/CLAUDE.md /home/services/ynab/CLAUDE.md /home/services/KidAI/CLAUDE.md /home/services/zoho-todoist-sync/CLAUDE.md; do grep -l "GSD:non-programmer-contract-start" "$f"; done | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `grep -l "GSD:non-programmer-contract-start" /home/services/debates/CLAUDE.md /home/services/reforma/CLAUDE.md /home/services/ynab/CLAUDE.md /home/services/KidAI/CLAUDE.md /home/services/zoho-todoist-sync/CLAUDE.md | wc -l` outputs `5`
    - `grep "GSD:non-programmer-contract-end" /home/services/debates/CLAUDE.md` returns 1 match
    - `grep "GSD:non-programmer-contract-end" /home/services/reforma/CLAUDE.md` returns 1 match
    - `grep "GSD:non-programmer-contract-end" /home/services/ynab/CLAUDE.md` returns 1 match
    - `grep "GSD:non-programmer-contract-end" /home/services/KidAI/CLAUDE.md` returns 1 match
    - `grep "GSD:non-programmer-contract-end" /home/services/zoho-todoist-sync/CLAUDE.md` returns 1 match
    - `grep "Global Env Editor" /home/services/debates/CLAUDE.md` returns 1 match (confirms table row present)
    - `grep "Deploy started" /home/services/zoho-todoist-sync/CLAUDE.md` returns 1 match (confirms table row present)
    - `grep "Verbosity Contract" /home/services/ynab/CLAUDE.md` returns 1 match (confirms backfill happened)
    - All existing content in each file is preserved (spot-check: `grep "SermonAudio" /home/services/debates/CLAUDE.md` still returns matches)
  </acceptance_criteria>
  <done>All 5 project CLAUDE.md files contain the Non-Programmer Contract section with GSD markers and the full 12-row forbidden→replacement table. ynab/CLAUDE.md also has the Verbosity Contract backfilled.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CLAUDE.md → Claude model | CLAUDE.md is loaded as system context — injected content governs Claude's behaviour in every session |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-56B-01 | Tampering | Project CLAUDE.md files | accept | Files are developer-owned config; only Claude or the user edits them; no untrusted input path |
| T-56B-02 | Repudiation | GSD marker boundaries | mitigate | Marker format `<!-- GSD:{name}-start source:{file} -->` ties each section to its source template for auditability; grep-verifiable |
| T-56B-03 | Information Disclosure | Forbidden→replacement table mentions Global Env Editor | accept | Table references public UI element; no secrets exposed |
</threat_model>

<verification>
After both tasks complete:

```bash
# Verify template updated
grep "GSD:non-programmer-contract-start" /home/claude/.claude/get-shit-done/templates/claude-md.md

# Verify all 5 project files updated
for f in /home/services/debates/CLAUDE.md /home/services/reforma/CLAUDE.md /home/services/ynab/CLAUDE.md /home/services/KidAI/CLAUDE.md /home/services/zoho-todoist-sync/CLAUDE.md; do
  echo -n "$f: "
  grep -c "GSD:non-programmer-contract-start" "$f"
done

# Verify table completeness (spot-check 3 rows)
grep "Deploy started\|Global Env Editor\|paste git diffs" /home/services/debates/CLAUDE.md
```

All 6 files (template + 5 projects) must contain exactly 1 GSD:non-programmer-contract-start marker.
</verification>

<success_criteria>
- Global CLAUDE.md template has Non-Programmer Contract section between Workflow Enforcement and Profile sections
- All 5 project CLAUDE.md files contain the Non-Programmer Contract section with 12-row forbidden→replacement table
- All GSD markers follow the exact format: `<!-- GSD:non-programmer-contract-start source:templates/claude-md.md -->`
- ynab/CLAUDE.md additionally has Verbosity Contract backfilled
- No existing content in any file was modified or removed
</success_criteria>

<output>
After completion, create `.planning/phases/56B-non-programmer-behavioural-contract/56B-01-SUMMARY.md`
</output>
