# Phase 56B: Non-Programmer Behavioural Contract - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an explicit "Non-Programmer Contract" to the global CLAUDE.md template and all existing project CLAUDE.md files. The contract forbids Claude from asking the user to perform programmer actions (reading code, running commands, editing files, pasting diffs) and specifies the replacement behaviour for each. Also delivers: GSD skill preamble updates for user-outcome question framing, a 20-prompt behavioural eval set, and a user-testing test plan doc. Terminal output is unchanged — this is a behavioural governance layer applied through CLAUDE.md rules.

</domain>

<decisions>
## Implementation Decisions

### CLAUDE.md Template Structure
- New dedicated "Non-Programmer Contract" section (NOT an extension of Workflow Enforcement — separate concern)
- Table format: Forbidden | Replacement — matches ROADMAP spec and is easily scannable
- Section positioned after Workflow Enforcement, before Profile
- Inject into all existing project CLAUDE.md files immediately (debates, reforma, ynab, KidAI, zoho-todoist-sync) — same rollout approach as Phase 56

### Eval Set (NPB-04)
- Markdown rubric doc stored in `.planning/phases/56B/` — readable, manually runnable
- Each prompt has a pass/fail rubric with violation type noted (for comparability across future runs)
- Advisory only — does not block phase verification
- Include 3 pre-graded example responses so future evaluators can calibrate

### NPB-07 User Testing Checkpoint
- Deliver a `NPB-07-TEST-PLAN.md` with 3 concrete scenarios (e.g. "Create a project named X and add Y feature")
- Mark as `human_needed` in VERIFICATION.md — not blocking phase completion
- Concrete scenario format, not abstract tasks

### Claude's Discretion
- Exact wording for each forbidden→replacement rule in the table
- Which GSD skill files (discuss-phase, plan-phase) need preamble additions and exact wording
- Whether NPB-06 credential rule ("use Global Env Editor panel, not terminal ask") lives in the contract table or as a separate note

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- CLAUDE.md GSD marker system: `<!-- GSD:{name}-start source:{file} -->` / `<!-- GSD:{name}-end -->` — new "Non-Programmer Contract" section follows this pattern
- Phase 56 rollout precedent: verbosity rules were injected into 6 existing project CLAUDE.md files + the GSD template — same approach here
- `/home/claude/.claude/get-shit-done/templates/claude-md.md` — the canonical template file to update with new section

### Established Patterns
- Section order in CLAUDE.md template: Project → Stack → Conventions → Architecture → Skills → Workflow Enforcement → [new: Non-Programmer Contract] → Profile
- Phase 56 CONTEXT.md (`.planning/phases/56/56-CONTEXT.md`) — the verbosity rules list applied to the same files this phase will update

### Integration Points
- Files to update: `/home/claude/.claude/get-shit-done/templates/claude-md.md` (template) + 5 existing project CLAUDE.md files
- GSD skill files for discuss-phase / plan-phase preambles (question framing rule for NPB-02/NPB-05)
- New deliverables: eval rubric doc + NPB-07-TEST-PLAN.md in the phase directory

</code_context>

<specifics>
## Specific Ideas

- Forbidden→replacement table rows should cover exactly the 5 cases from the ROADMAP: opening/viewing code, pasting git diffs, editing config/env files, running terminal commands, "deploy started check back later"
- NPB-06 (credentials panel) can be a row in the same table: "Asking user to paste an API key in the terminal | Use the Global Env Editor panel (Dashboard)"
- The GSD skill preamble update is a lightweight add: one sentence instructing discuss/plan to frame questions in user-outcome terms, not implementation terms

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 56B — Non-Programmer Behavioural Contract*
*Context gathered: 2026-05-11*
