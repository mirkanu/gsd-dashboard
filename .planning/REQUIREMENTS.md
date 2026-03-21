# Requirements: GSD Dashboard v1.2

**Defined:** 2026-03-21
**Core Value:** See live project momentum and agent activity from anywhere — no localhost required.

## v1.2 Requirements

### Agent Data Pipeline

- [ ] **PIPE-01**: When accessed via the Railway URL, the agent dashboard (sessions, events, stats) shows real data from the local machine's SQLite database — not an empty database
- [ ] **PIPE-02**: The Railway server proxies agent data API requests through `GSD_DATA_URL` to the local server, using the same tunnel pattern already working for GSD files
- [ ] **PIPE-03**: The local server exposes agent data endpoints that the Railway proxy can forward to (sessions, agents, events, stats, analytics)
- [ ] **PIPE-04**: If `GSD_DATA_URL` is not set (local dev), the server serves its own local data directly with no proxy involved

### GSD Card — Next Action

- [ ] **NEXT-01**: Each project card displays the "Next action" line parsed from that project's STATE.md
- [ ] **NEXT-02**: If STATE.md has no next action recorded, the card shows nothing in that slot (no placeholder text)

### GSD Card — Blocked Indicator

- [ ] **BLOCK-01**: Any project with one or more blockers recorded in STATE.md shows a visible "Blocked" badge on its card
- [ ] **BLOCK-02**: Blocked projects are automatically sorted to the top of the project grid
- [ ] **BLOCK-03**: The `/api/gsd/projects` response includes a `blockers` array so the frontend can determine blocked state without re-parsing STATE.md

### GSD Card — Active Session Pulse

- [ ] **SESS-01**: A project card shows a live green pulse indicator when a Claude Code session is currently active in that project's working directory
- [ ] **SESS-02**: The active session state is derived from the agent dashboard's `sessions` data (status = "active", cwd matches project root)
- [ ] **SESS-03**: The pulse indicator updates in real time via WebSocket (no manual refresh needed)

### GSD Card — Velocity & Streak

- [ ] **VEL-01**: Each project card shows how many plans were completed in the last 7 days (velocity)
- [ ] **VEL-02**: Each project card shows the current streak: number of consecutive days with at least one plan completed (derived from SUMMARY.md timestamps in `.planning/phases/`)
- [ ] **VEL-03**: The `/api/gsd/projects` response includes `velocity` (int) and `streak` (int) fields computed server-side

### GSD Card — Time-to-Completion Estimate

- [ ] **TTL-01**: Each project card shows an estimated time to completion based on remaining plans × average plan duration
- [ ] **TTL-02**: Average plan duration is computed from completed SUMMARY.md files (using last_updated timestamps where available, falling back to file modification time)
- [ ] **TTL-03**: If there are no completed plans to average from, or no remaining plans, no estimate is shown
- [ ] **TTL-04**: The estimate is displayed as a human-readable string (e.g. "~2 days", "~1 week")

## Future Requirements (deferred)

- Auto-refresh GSD data every N minutes (configurable interval)
- Phase timeline / Gantt-style view across projects
- Named Cloudflare Tunnel for stable permanent URL
- Browser notification when a phase completes
- Trend graph showing requirements coverage over time
- Tool call heatmap on GSD stats panel
- Model mix breakdown (% Opus vs Sonnet vs Haiku) per project

## Out of Scope (v1.2)

| Feature | Reason |
|---------|--------|
| Cost per phase / token cost tracking | User is on Claude Pro subscription — cost-per-token not applicable |
| Editing planning files from dashboard | Read-only tool — edits belong in the editor |
| Per-user analytics (Admin API) | Requires Admin API key, not standard API key |
| Push notifications | Scope creep — defer to later milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | TBD | Pending |
| PIPE-02 | TBD | Pending |
| PIPE-03 | TBD | Pending |
| PIPE-04 | TBD | Pending |
| NEXT-01 | TBD | Pending |
| NEXT-02 | TBD | Pending |
| BLOCK-01 | TBD | Pending |
| BLOCK-02 | TBD | Pending |
| BLOCK-03 | TBD | Pending |
| SESS-01 | TBD | Pending |
| SESS-02 | TBD | Pending |
| SESS-03 | TBD | Pending |
| VEL-01 | TBD | Pending |
| VEL-02 | TBD | Pending |
| VEL-03 | TBD | Pending |
| TTL-01 | TBD | Pending |
| TTL-02 | TBD | Pending |
| TTL-03 | TBD | Pending |
| TTL-04 | TBD | Pending |

**Coverage:**
- v1.2 requirements: 19 total
- Mapped to phases: 0 (roadmap pending)
- Unmapped: 19

---
*Requirements defined: 2026-03-21*
