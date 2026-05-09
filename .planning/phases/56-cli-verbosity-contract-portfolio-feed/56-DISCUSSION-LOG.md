# Phase 56: CLI Verbosity Contract + Portfolio Feed - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 56-cli-verbosity-contract-portfolio-feed
**Areas discussed:** Feed placement, Signal extraction, Verbosity contract scope, Config toggles

---

## Feed Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Replace both (Dashboard + /activity) | Portfolio Feed replaces Dashboard 'Recent Activity' AND /activity route | |
| Replace /activity only | /activity becomes Portfolio Feed; Dashboard card keeps raw events | |
| Add as new page, keep activity | New sidebar entry; old /activity stays for debugging | |
| Replace Dashboard section + new page | Compact preview on Dashboard; full page at /feed with sidebar entry | ✓ |
| Replace Dashboard section only | Replaces inline card, no dedicated full page | |
| New sidebar page only | New page with sidebar entry; Dashboard card removed | |

**User's choice:** Replace Dashboard section + new page (compact preview on Dashboard, full /feed page with sidebar nav entry)
**Notes:** User asked to see the current "Recent Activity" location before deciding. It's a card at the bottom of the Dashboard page below the agents list. /activity was already a redirect to / (cleaned in Phase 50.5). Portfolio Feed gets a proper sidebar nav entry.

---

## Signal Extraction

| Option | Description | Selected |
|--------|-------------|----------|
| Regex on tmux pane output | Extend existing extractCurrentTask() with landmark pattern matching | ✓ |
| GSD hook injection | Emit structured signal lines from GSD skills | |
| Both (hooks + regex fallback) | Hybrid approach, most reliable, most work | |

**Landmark event types selected:** All 4 — Plan complete, Verify passed/failed, Session waiting for input, Phase complete.

| Storage option | Description | Selected |
|----------------|-------------|----------|
| New SQLite table | Persists across restarts | |
| In-memory only | Lost on restart, simple | ✓ |

**User's choice:** Regex on tmux output; all 4 event types; in-memory storage.
**Notes:** User prefers the simpler approach. Feed resets on server restart — acceptable trade-off.

---

## Verbosity Contract Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Template only (new projects) | Update Phase 51 template; existing projects unchanged | |
| Template + this project now | Update template + apply to GSD Dashboard CLAUDE.md | |
| Template + all existing projects | Update template + all 6 existing project CLAUDE.md files | ✓ |

**Additional rules beyond NAR-01's 5:** None selected — the 5 listed rules are sufficient.

**User's choice:** Apply to template AND all existing projects immediately.
**Notes:** Existing projects: gsddashboard, debates, reforma, ynab, KidAI, zoho-todoist-sync. No additional verbosity rules beyond the 5 in NAR-01.

---

## Config Toggles

**User initially said:** "I don't understand this at all" — needed plain-English explanation.

After explanation (CONTEXT.md re-ask = skip re-asking when CONTEXT.md exists; per-plan ceremony = suppress preamble/postamble text around plan execution):

| Option | Description | Selected |
|--------|-------------|----------|
| Add both toggles | suppress_context_reask + suppress_plan_ceremony in Config page | ✓ |
| Skip NAR-02 entirely | CLAUDE.md rules are enough, no UI toggles | |

**User's choice:** Add both toggles to the Config page.
**Notes:** Both default to off (preserving current behavior). User opts in per-project.

---

## Claude's Discretion

- Feed UI design (card style, timestamp format, project badge) — follow existing patterns
- Regex patterns for landmark event detection
- In-memory event cap per project

## Deferred Ideas

None — discussion stayed within phase scope.
