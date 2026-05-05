# Phase 71: CLAUDE.md-First Automation Refactor - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove server-side automatic injection of GSD slash commands into live Claude sessions. Two targets: (1) the stateBroadcaster working→waiting auto-verify trigger, and (2) the Autopilot auto-trigger. Replace with CLAUDE.md-level behavioural rules (global template) and a gsd-complete-milestone backstop check. Keep the VerifyBadge UI and WebSocket broadcasting layer — driven by STATE.md polling, not server-side triggering.

User-triggered injections (Pause button → `/gsd-pause-work`, wizard → `/gsd-new-project`, import seed → `/gsd-analyse-codebase`, terminal passthrough) are explicitly out of scope and must not be changed.

</domain>

<decisions>
## Implementation Decisions

### Injection Scope
- **D-01:** Only automatic injections (firing without user intent) are in scope. The two targets are: `server/gsd/stateBroadcaster.js:131` (working→waiting → `maybeStartVerify`) and `server/autopilot/processSpawner.js` + `server/autopilot/AutopilotManager.js` (Autopilot auto-trigger).
- **D-02:** User-triggered injections are preserved unchanged: Pause button (`/gsd-pause-work`), wizard (`/gsd-new-project`), import seed (`/gsd-analyse-codebase`), terminal passthrough, re-open flows.

### Auto-Verify Replacement
- **D-03:** Primary replacement is a CLAUDE.md rule in the **global GSD CLAUDE.md template** (the template all new projects inherit). Rule: "After every plan execution completes, run `/gsd-verify-work` before reporting done — do not wait for a dashboard trigger." All existing projects get it on next template sync.
- **D-04:** Do NOT bake verify into the `/gsd-execute-phase` skill — a GSD update could invalidate it and break the behavior silently.
- **D-05:** Backstop: `/gsd-complete-milestone` must warn and require confirmation if no verification record is found for the most recent executed phase. Check: does STATE.md contain a `uat.completedAt` entry for the most recent execute? If not, surface: "Phase X has no verification record. Continue anyway?" Non-blocking (warn + confirm, not hard block).

### Autopilot
- **D-06:** Disable the Autopilot auto-trigger. Autopilot becomes a manual-only tool (user clicks "Run Next Phase" in the UI). Remove the automatic condition-checking / idle-state polling that fires commands without user action. The processSpawner.js and route remain for manual use.

### Dashboard Signal (VerifyBadge)
- **D-07:** Keep the STATE.md polling in `verifyOrchestrator.js` — it already polls `uat.completedAt` / `uat.issues` from STATE.md and broadcasts via WebSocket. Remove only the tmux trigger (`maybeStartVerify` call in stateBroadcaster). The badge stays live because it reads Claude's own STATE.md writes, not a server-initiated verify.
- **D-08:** The manual Verify button (POST `/api/gsd/projects/:name/verify`) stays as-is. `verifyOrchestrator.js` is not deleted.

### What Gets Removed vs. Kept
- **Remove**: `maybeStartVerify` call at `server/gsd/stateBroadcaster.js:131` (the working→waiting fire-and-forget trigger)
- **Remove**: Autopilot auto-trigger logic (condition polling / auto-dispatch in AutopilotManager)
- **Keep**: `verifyOrchestrator.js` (serves manual Verify button + STATE.md polling + WebSocket broadcasts)
- **Keep**: `stateBroadcaster.js` polling (everything except the maybeStartVerify call)
- **Keep**: All user-triggered tmux injections

### Claude's Discretion
- Exact wording of the CLAUDE.md global template rule — researcher should look at existing global template text and propose language consistent with current tone.
- Whether the `gsd-complete-milestone` check lives in the skill directly or as a pre-flight hook — researcher to check current skill structure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary Change Targets
- `server/gsd/stateBroadcaster.js` — Line 131: the `maybeStartVerify` call is the exact removal point. Lines 85–133 for full context of the polling/transition/trigger loop.
- `server/gsd/verifyOrchestrator.js` — Full file: keep STATE.md polling + WebSocket broadcasts; remove nothing here. Entry points: `startVerify`, `runVerify`, `maybeStartVerify`, `isVerifying`.
- `server/autopilot/AutopilotManager.js` — Auto-trigger logic to be disabled.
- `server/autopilot/processSpawner.js` — Keep for manual use; remove auto-dispatch path only.

### Phase 53 Context (the feature being partially rolled back)
- `.planning/phases/53-auto-verify-by-default/53-03-PLAN.md` — Documents what was built: stateBroadcaster trigger wiring, verifyOrchestrator DI pattern.
- `.planning/phases/53-auto-verify-by-default/53-01-SUMMARY.md` — verifyOrchestrator architecture and test coverage.
- `server/__tests__/verifyOrchestrator.test.js` — Existing test suite; must remain green after changes.

### Requirements Context
- `.planning/REQUIREMENTS.md` §ATV-01 — "After /gsd:execute-phase completes, Dashboard automatically triggers /gsd:verify-work without user action." This requirement is being SUPERSEDED by the CLAUDE.md-first approach.

### GSD Global Template (research target)
- Researcher: locate the GSD global CLAUDE.md template file (likely in `~/.claude/get-shit-done/templates/` or `~/.claude/CLAUDE.md`) to understand current tone and structure before writing the verify rule.

### GSD complete-milestone skill (research target)
- Researcher: locate `/gsd-complete-milestone` skill definition (likely in `~/.claude/skills/gsd-complete-milestone/` or similar) to understand where the verification check should be inserted.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `verifyOrchestrator._testStartVerify(project, opts, fns)`: DI pattern — all I/O injectable. Keep this intact; tests depend on it.
- `stateBroadcaster._testPollOnce(project, opts, fns)`: Same DI pattern for testing the broadcaster without side effects.

### Established Patterns
- **Dependency injection for testability**: Both stateBroadcaster and verifyOrchestrator use `_test*` variants with injected functions. Any changes must preserve this pattern so existing tests remain valid.
- **Fire-and-forget on transition**: The `maybeStartVerify` call is wrapped in `.catch(() => {})` — removal is straightforward, no async chain to unwind.
- **STATE.md as signal bus**: verifyOrchestrator polls `uat.completedAt` + `uat.issues` from STATE.md. This polling loop is the correct mechanism post-change — Claude writes to STATE.md, Dashboard reads it.

### Integration Points
- `stateBroadcaster.js:131` → `verifyOrchestrator.maybeStartVerify` — the one line to remove
- `AutopilotManager` → condition check that fires `processSpawner` — the auto-dispatch loop to disable
- `gsd-complete-milestone` skill — where the verification backstop check needs to be added

</code_context>

<specifics>
## Specific Ideas

- User noted concern about baking verify into `/gsd-execute-phase` skill: "a GSD update could invalidate it." Preference is for CLAUDE.md behavioral rules over skill modifications for durability.
- The gsd-complete-milestone backstop is framed as a safety net, not a gate — warn + confirm pattern, not hard block.

</specifics>

<deferred>
## Deferred Ideas

- **Fresh-session Autopilot**: Spawning new `claude` sessions with startup command args (rather than injecting into existing sessions) was discussed as a future Autopilot improvement. Not addressed in Phase 71 — Autopilot is simply disabled for now.
- **CLAUDE.md-first for other user-triggered injections**: `/gsd-new-project`, `/gsd-analyse-codebase` wizard injections were noted as potential future reconsiderations but explicitly kept out of Phase 71 scope.

</deferred>

---

*Phase: 71-claude-md-first-automation-refactor*
*Context gathered: 2026-05-05*
