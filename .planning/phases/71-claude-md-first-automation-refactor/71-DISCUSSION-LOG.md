# Phase 71: CLAUDE.md-First Automation Refactor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 71-claude-md-first-automation-refactor
**Areas discussed:** Injection scope, Autopilot scope, Auto-verify replacement, CLAUDE.md rule location, Milestone backstop, Dashboard signal, Done check

---

## Injection Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic-only | Only injections without user intent (auto-verify trigger, Autopilot) | ✓ |
| All GSD slash commands | Every /gsd-* injection regardless of user trigger | |
| Everything except terminal passthrough | Including wizard/re-open startup commands | |

**User's choice:** Automatic-only (Recommended)
**Notes:** User framed it as a broader principle — re-evaluate every planned tmux injection for whether it's the right approach. Context-limit risk is the primary concern. But user-triggered injections (Pause, wizard, import seed) are intentional and stay.

---

## Autopilot Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — in scope | Autopilot is automatic injection, should be re-evaluated | ✓ |
| No — out of scope | Autopilot is an intentional automation feature | |
| Document but don't change | Flag as known risk, defer to dedicated phase | |

**User's choice:** Yes — Autopilot is in scope
**Notes:** Autopilot fires commands without user intent at the moment, same context-limit risk pattern.

---

## Auto-Verify Replacement

| Option | Description | Selected |
|--------|-------------|----------|
| GSD execute-phase skill | Bake verify into the end of /gsd-execute-phase | |
| CLAUDE.md rule only | Global template rule: "after execute-phase, run verify-work" | ✓ (with caveats) |
| Both — skill + CLAUDE.md | Belt-and-suspenders | |

**User's choice:** CLAUDE.md rule, but raised an additional idea: check whether gsd-complete-milestone flags that verification hasn't been done as a backstop.
**Notes:** User is nervous about option 1 — "a GSD update could invalidate it." Prefers CLAUDE.md behavioral rules for durability over skill modifications.

---

## CLAUDE.md Rule Location

| Option | Description | Selected |
|--------|-------------|----------|
| Global CLAUDE.md template | All new projects inherit; existing on next sync | ✓ |
| This project's CLAUDE.md only | Scoped to gsddashboard | |
| GSD project CLAUDE.md template | New projects only | |

**User's choice:** Global CLAUDE.md template (Recommended)

---

## Milestone Backstop

| Option | Description | Selected |
|--------|-------------|----------|
| Warn + require confirmation | Surface warning, user can still proceed | ✓ |
| Hard block | Cannot complete milestone without verify | |
| Warn only, no gate | Advisory only | |

**User's choice:** Warn + require confirmation (Recommended)

---

## Dashboard Signal (VerifyBadge)

| Option | Description | Selected |
|--------|-------------|----------|
| STATE.md polling | Keep existing polling, remove trigger only | ✓ |
| Claude Code hook → API callback | New hook + endpoint for push signal | |
| Accept simpler badge | Last-known result only, no live animation | |

**User's choice:** STATE.md polling (Recommended)
**Notes:** verifyOrchestrator already polls STATE.md for UAT results. Remove trigger, keep polling. Badge stays live from Claude's own STATE.md writes.

---

## Claude's Discretion

- Exact wording of the CLAUDE.md global template verify rule (researcher to propose language consistent with existing template tone)
- Whether the gsd-complete-milestone check is a direct skill edit or a pre-flight hook

## Deferred Ideas

- **Fresh-session Autopilot**: Spawning new `claude` sessions with startup command args instead of injecting into existing sessions — better long-term fix for Autopilot context-limit risk, not in Phase 71 scope.
- **User-triggered injection review**: `/gsd-new-project`, `/gsd-analyse-codebase` could also be reconsidered in a future phase.
