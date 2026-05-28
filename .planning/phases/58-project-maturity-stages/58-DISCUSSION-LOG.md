# Phase 58: Project Maturity Stages - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 58-project-maturity-stages
**Areas discussed:** Stage definition overview, Stage gate matrix, BetterStack/R2 provisioning, Kill/archive flow, Backfill UX, Stage nudges, Card UI per stage, Kanban/stage grouping view

---

## Stage Definition Overview

User requested a walkthrough of the stage matrix and implications before diving into gray areas. Reviewed the 6-stage matrix from ROADMAP.md and identified open implementation questions.

**Notes:** User specifically wanted to understand progression rules, what each stage gates, and what standard infrastructure solutions apply (R2, BetterStack).

---

## Stage Gate Matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Hard gate at Beta→Launched | R2 + BetterStack required before Launched | ✓ |
| Hard gate at Alpha→Beta | Require monitoring even earlier | |
| Soft recommendations everywhere | Never block, only suggest | |

**User's choice:** Hard gate at Beta→Launched
**Notes:** User specifically wanted to expand the gate matrix beyond just R2/BetterStack — prompted exploration of full gate matrix for all transitions. Final gate matrix: Draft→Alpha (name only), Alpha→Beta (preview URL soft), Beta→Launched (production URL + BetterStack + R2 hard gates).

---

## BetterStack + R2 Auto-Provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-provision if missing | Wizard creates monitor/bucket using global API keys | ✓ (Claude's discretion) |
| Check only | Wizard shows ✗ and explains what's needed | |

**User's choice:** Claude's discretion
**Notes:** Given global API keys already exist in env, auto-provisioning is the clear choice (consistent with existing GitHub repo creation pattern in the pipeline).

---

## Alpha→Beta Preview URL Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Hard gate | Block transition without preview URL | |
| Soft recommendation | Warn but don't block | ✓ |

**User's choice:** Soft recommendation
**Notes:** User also flagged that Railway must not be mentioned anywhere — projects have moved from Railway to Hetzner. Saved as a memory. Deploy URLs are free-form, no platform assumptions.

---

## Kill / Archive Flow (MAT-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm dialog with consequences | Two buttons: Cancel / Delete permanently | |
| Type-to-confirm (project name) | User types project name | |
| Two-step: soft delete first | 24h window to reverse | |

**User's choice:** Custom — two-tier approach
**Notes:** User proposed: "Archive" (soft cancel, keeps files + repo, stops tmux, reversible) vs "Full delete" (type `DELETE` to confirm, destroys everything). This replaces the original MAT-08 framing with a more nuanced flow.

---

## Backfill Flow (MAT-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Banner on first load | One-time banner, quick-assign flow | |
| Blocking startup flow | Can't dismiss without assigning | |
| Inline card prompt | Per-card chip until stage assigned | ✓ |

**User's choice:** Inline card prompt
**Notes:** No banner, no blocking. Each project card shows "Assign stage" chip until it has one.

---

## Stage Nudges (MAT-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Portfolio Feed entry | Feed event with 'Start transition' link | |
| Card badge | Subtle ⬆ chip on the card | |
| Both — Feed + card badge | Feed fires once; badge stays until dismissed | ✓ |

**User's choice:** Both (Feed + card badge)
**Notes:** User asked "what is this portfolio feed?" — explained it's the `/feed` page built in Phase 56 showing landmark events in plain English across all projects.

---

## Card UI Per Stage (MAT-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic by stage | Stage drives task surface (no config needed) | |
| User-configurable override | Stage sets default, Config tab allows override | ✓ |

**User's choice:** User-configurable override
**Notes:** Stage sets the default (Dashboard tasks for Draft/Alpha/Beta; GitHub Issues for Launched/Maintenance). Config tab allows per-project override.

---

## Stage Grouping / Kanban View

| Option | Description | Selected |
|--------|-------------|----------|
| /kanban page with sidebar nav entry | Activates dormant /kanban route | |
| Tab on Dashboard main page | New tab alongside project list | |
| Both — /kanban + Dashboard toggle | Full-page + inline toggle | |

**User's choice:** Custom — "Group by" toggle inside existing Dashboard left panel
**Notes:** User proposed: current session-state tabs (Waiting/Working/Paused) get a companion "Group by Stage" mode. Same project cards, just grouped under stage section headers. No new route. This uses the existing `ChatListFilters` component. `/kanban` stays dormant.

---

## Claude's Discretion

- BetterStack API call shape for monitor creation (reference `costMeasurement.js` pattern)
- R2 bucket naming convention per project
- Stage nudge eligibility formula (how "14 days + 12 commits" is tracked)
- Section header styling and emoji for stage groups on Dashboard
- Config tab UI for task-surface override toggle
- Auto-provisioning chosen for BetterStack/R2 (global keys available, consistent with project pipeline)

## Deferred Ideas

- **Drag-to-promote on Kanban:** Drag card to new stage column triggers wizard — deferred to Phase 61
- **Railway cleanup:** Remove Railway entries from `gsd-projects.json` and server files — separate quick task
- **Auto-promotion on merged PRs + green CI:** Phase 61 scope
- **Stage-aware card layouts:** Different card designs per stage — Phase 58 stretch goal only; grouping headers are the Phase 58 deliverable
