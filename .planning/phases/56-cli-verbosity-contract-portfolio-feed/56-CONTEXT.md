# Phase 56: CLI Verbosity Contract + Portfolio Feed - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce what Claude says in the terminal (CLAUDE.md verbosity rules + 2 per-project Config page toggles) and surface landmark events as a plain-English Portfolio Feed (Dashboard compact preview + full `/feed` page with sidebar nav entry). The terminal stream itself is unchanged — we reduce what Claude emits, and extract signals from it additively.

</domain>

<decisions>
## Implementation Decisions

### Portfolio Feed — Placement
- **D-01:** Portfolio Feed replaces the Dashboard's "Recent Activity" card with a compact preview (latest N events).
- **D-02:** A full Portfolio Feed page lives at `/feed` (taking over the dormant `/activity` redirect slot).
- **D-03:** "View All →" on the Dashboard card links to `/feed`.
- **D-04:** `/feed` gets a sidebar nav entry alongside Projects, Usage, Server, etc.

### Portfolio Feed — Signal Extraction
- **D-05:** Landmark events are detected by **regex on tmux pane output**, extending the existing `extractCurrentTask()` in `server/gsd/tmux.js`. No GSD hook injection.
- **D-06:** The following 4 event types count as landmark:
  - **Plan complete** — SUMMARY.md written, `/gsd-execute-phase` plan done
  - **Verify passed / failed** — verify-work run completed (both outcomes surfaced)
  - **Session waiting for input** — Claude stopped, waiting for user (already detected by stateBroadcaster)
  - **Phase complete** — entire phase finished (all plans + verify done)
- **D-07:** Landmark events are stored **in-memory only** — a server-side array, no new SQLite table. Feed resets on server restart.
- **D-08:** Feed entries are plain English: "Finished Plan 02 on GSD Dashboard 2m ago", "Verify passed on GSD Dashboard 3m ago", "Waiting for input on Debates 5m ago".

### Verbosity Contract — Scope
- **D-09:** Apply the verbosity rules to **the project CLAUDE.md template** (Phase 51 project-creation template) AND to **all existing project CLAUDE.md files** immediately: gsddashboard, debates, reforma, ynab, KidAI, zoho-todoist-sync.
- **D-10:** The 5 rules from NAR-01 are the complete set — no additions:
  1. Skip CONTEXT.md interrogation when project already has a CONTEXT.md
  2. Name the phase in plain English in the first line of the session report
  3. Don't repeat what the user just said
  4. Prefer one-line status updates
  5. Active voice, present tense

### Config Page Toggles
- **D-11:** Add 2 per-project toggles to the Config page (writes to `.planning/config.json`):
  - `suppress_context_reask` — when CONTEXT.md exists, skip re-asking (CONTEXT.md re-ask suppression)
  - `suppress_plan_ceremony` — suppress preamble/postamble narration around each plan execution
- **D-12:** Both toggles default to **off** (current behaviour preserved) — user opts in per project.

### Claude's Discretion
- Feed UI design (card style, timestamp format, project badge) — follow existing card/badge patterns in the codebase.
- Regex patterns for landmark detection — Claude picks the most reliable patterns from the existing tmux output format.
- In-memory event cap (max events held) — Claude picks a sensible limit (e.g., 200 events per project).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §NAR — NAR-01 through NAR-05 define all deliverables for this phase

### Existing Signal Infrastructure
- `server/gsd/tmux.js` — `extractCurrentTask()` at line ~396; signal extraction extends this function
- `server/gsd/stateBroadcaster.js` — imports `extractCurrentTask`, broadcasts session state; landmark event detection hooks in here
- `server/gsd/proxyStateBroadcaster.js` — proxy broadcaster (check if landmark events need to flow through here too)

### Existing UI Surfaces to Modify
- `client/src/pages/Dashboard.tsx` — "Recent Activity" section (lines ~273–320); replace with Portfolio Feed preview
- `client/src/components/Sidebar.tsx` — add `/feed` nav entry
- `client/src/App.tsx` — `/activity` route (line 66) currently redirects to `/`; replace with `/feed` route
- `client/src/pages/ConfigPage.tsx` — add 2 verbosity toggle controls

### Project CLAUDE.md Files to Update
- `/home/services/gsddashboard/CLAUDE.md` — this project
- All other project CLAUDE.md files in `/home/services/` (debates, reforma, ynab, KidAI, zoho-todoist-sync)
- GSD project creation template in Phase 51 scaffolding

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extractCurrentTask()` (`server/gsd/tmux.js:396`) — already parses tmux pane text to find current user task. Extend with landmark pattern matching.
- `stateBroadcaster.js` — already polls tmux and emits state changes via WebSocket. Landmark event emission can piggyback on the existing broadcast cycle.
- `AgentStatusBadge` component — reuse for event type indicators in the feed.
- Existing `card` / `divide-y divide-border` pattern from Dashboard "Recent Activity" — reuse for the compact feed preview.

### Established Patterns
- Page route + sidebar entry: follow the `EnvEditorPage` + Sidebar pattern from Phase 54 (most recent example).
- Config toggles: ConfigPage.tsx already renders per-project config fields — follow existing field rendering pattern.
- In-memory state on the server: existing `autopilot/` module manages in-memory session state — check for analogous patterns.

### Integration Points
- Landmark events flow: `stateBroadcaster.js` detects state → calls new `extractLandmarkEvent()` → pushes to in-memory store → broadcasts via WebSocket → Dashboard/Feed page renders.
- Config toggle flow: Config page UI → `PUT /api/config` (existing route) → writes `.planning/config.json` → GSD reads on next skill invocation.

</code_context>

<specifics>
## Specific Ideas

- Feed entry format: `"{action} on {project} {timeAgo}"` — e.g., "Finished Plan 02 on GSD Dashboard 2m ago", "Verify failed on Debates 8m ago".
- Session waiting events are already detected by `stateBroadcaster`; reuse that detection to emit a landmark event rather than duplicating the logic.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 56-CLI Verbosity Contract + Portfolio Feed*
*Context gathered: 2026-05-09*
