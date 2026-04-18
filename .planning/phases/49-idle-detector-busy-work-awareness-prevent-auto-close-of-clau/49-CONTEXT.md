# Phase 49: Idle Detector Busy-Work Awareness — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** Direct authorization (user delegated technical decisions)

<domain>
## Phase Boundary

**Problem:** `idleDetector.js` auto-closes tmux sessions whose pane-state is `waiting` for > `idle_timeout_minutes`. This misfires when Claude is *logically* busy — waiting on a `run_in_background:true` bash, a `ScheduleWakeup` firing, or an Agent task — because the tmux pane is at a prompt. Real incident: PRC session was at risk of being killed while Claude was waiting on a 4-hour sermon backfill poll.

**Deliverable:** A busy-marker subsystem that lets the idle detector distinguish "Claude is idle" from "Claude is waiting on its own in-flight background work". Auto-close is skipped for the latter. Every skip is logged for audit.

**Out of scope:**
- Changes to pane-state detection algorithm
- Changes to auto-close for pane-state `working` (already correct)
- Manual pin/unpin UI (rejected in favor of fully automatic detection)
- Changes to Railway cost measurement
- Cross-session telemetry (busy markers are local file state)

</domain>

<decisions>
## Implementation Decisions

### Signal source: Claude Code hooks (PreToolUse / PostToolUse / SubagentStop)
- **New hook handler:** `.claude/hooks/gsd-busy-marker.js` invoked on:
  - `PreToolUse` matching `Bash` → if `tool_input.run_in_background === true`, write marker
  - `PreToolUse` matching `Agent|Task` → write marker (agent may run long)
  - `PostToolUse` matching `Bash` → if marker for this shell ID exists, clear it
  - `SubagentStop` → clear the agent marker
- **`ScheduleWakeup` support:** Claude Code fires no tool hook for `ScheduleWakeup`. Handled via complementary `Stop` hook that checks if Claude is exiting with a pending scheduled wakeup (sentinel exposed via Claude Code's stop reason); if so, writes a TTL marker set to the scheduled delay.
- **Rationale:** Hooks are the canonical signal — they fire reliably, are already part of the dashboard's architecture (`hooks.js`), and don't require pane-text scraping.

### State store: JSON file per session, not a new DB table
- **Location:** `data/busy-markers/<session_id>.json` (session_id = tmux session name, same identifier used elsewhere)
- **Schema:**
  ```json
  {
    "markers": [
      { "id": "<shell_id|agent_id|wakeup_id>", "kind": "bash_bg|agent|wakeup", "started_at": "ISO8601", "ttl_ms": 3600000, "tool_name": "Bash", "note": "optional short text" }
    ]
  }
  ```
- **Rationale:** Hook handlers run as short-lived Node processes; file I/O is simplest and avoids needing a DB connection in the hook path. Per-session files avoid write contention across projects. SQLite can be added later if we need queryable history.

### Clear logic: explicit clear + TTL fallback
- **Primary:** explicit clear on `PostToolUse` / `SubagentStop` matching the marker id.
- **TTL fallback:**
  - `bash_bg`: 4h default (covers long polls like PRC backfill)
  - `agent`: 2h default (agents rarely exceed)
  - `wakeup`: exact scheduled delay + 5min grace
- **Sweep:** idle detector tick (every 60s) removes expired markers as a side effect of reading.
- **Rationale:** Explicit clear is correct; TTL prevents leaks when a hook is skipped (Claude Code crash, forced kill, handler error).

### Idle detector integration
- **New helper:** `server/gsd/busyMarkers.js` — `hasBusyMarkers(sessionName)` reads the JSON, purges expired entries, returns boolean.
- **idleDetector.js change:** in `_testCheckAndCloseSession`, after pane-state is confirmed `waiting` and idle threshold exceeded, call `hasBusyMarkers(project.tmux_session)`. If true, skip graceful shutdown, log skip reason, return `{ action: 'skipped', reason: 'busy-markers-present', project, markers }`.
- **No change to force-kill on `working` stuck 6h** — that path is unrelated.

### UI surface: sub-state badge on Projects page
- **Source of truth:** extend `/api/gsd/projects` response (or existing state broadcaster) to include `busy_markers: { count, kinds }` when non-empty.
- **Badge render:** when session pane-state is `waiting` AND `busy_markers.count > 0`, show `waiting · bg` with a tooltip listing kinds ("2 background tasks, 1 scheduled wakeup").
- **Config page:** no new controls. Auto-detection is automatic.
- **Rationale:** One new field, existing WS push infrastructure reuses it; zero new API surface.

### Observability / audit trail
- **Log target:** append JSONL to `data/logs/idle-skip.log` on every skip decision. Schema: `{ts, session, reason, markers}`.
- **Retention:** pruned by existing weekly disk-prune cron (add to its target list — mtime +30d).
- **Dashboard surface:** no new UI yet. If false positives are reported, the log is the evidence.

### Testing approach
- **Unit:** new `__tests__/busy-markers.test.js` (write/clear/TTL/hasBusyMarkers).
- **Integration:** extend `__tests__/idle-detector.test.js` to cover the skip path (markers present → no shutdown, markers absent → shutdown as today, expired markers purged).
- **Hook handler:** separate test exercising the `.claude/hooks/gsd-busy-marker.js` script via stdin JSON payloads (PreToolUse Bash with run_in_background=true → creates marker file; PostToolUse matching id → removes).

### Claude's Discretion
- Exact badge color/icon (frontend-reviewer to decide)
- Whether to add `hasBusyMarkers` to the WS `project:state` message or add a new `project:busy` message — planner decides based on existing stateBroadcaster patterns
- File paths inside `data/` — follow `server/db.js` / `costMeasurement.js` conventions
- Whether to consolidate all markers into a single `data/busy-markers.json` vs per-session files — planner picks based on lock contention analysis

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Idle detection (the subsystem being extended)
- `server/gsd/idleDetector.js` — `_testCheckAndCloseSession` is the integration point (line ~159). `isSessionIdle`, `hasActiveAutopilotRun` patterns to preserve.
- `server/gsd/gracefulShutdown.js` — called by idle detector; don't modify.
- `server/gsd/tmux.js` — `detectSessionStateAsync`, `paneHashCache`; read-only reference.
- `server/__tests__/idle-detector.test.js` — test pattern to extend.

### Hook ingestion (existing analogs)
- `server/routes/hooks.js` — how PostToolUse/PreToolUse hook payloads reach the server. New handler is client-side (`.claude/hooks/`), not server-side.
- `.claude/hooks/gsd-context-monitor.js` — closest analog for a hook that writes local state; read for pattern.
- `.claude/settings.json` — hooks array is extended here; preserve existing hook order.

### State broadcast / UI
- `server/gsd/stateBroadcaster.js` — where project state is assembled and pushed over WS. New `busy_markers` field threaded through here.
- `server/routes/gsd.js` — `/api/gsd/projects` response shape.
- `client/src/pages/Dashboard.tsx` / `ServicesPage.tsx` — where project cards render. Look for existing pane-state badge to co-locate.

### Infra / conventions
- `/data/home/gsddashboard/CLAUDE.md` — backend rules: preserve WS message types, prepared statements, non-blocking hook behavior.
- `.claude/rules/backend-node.md` — status transition rules.
- `server/autopilot/AutopilotManager.js` — shows precedent for using `data/` subdirectories for runtime state.

</canonical_refs>

<specifics>
## Specific Ideas

- PRC session recorded bg poll `b2fre8h32` as the motivating example — keep that identifier style (`<sessionShortHash>`) in mind if tying markers to Claude's own shell-id naming.
- Weekly `disk-prune.sh` (installed 2026-04-18 via PM2) already prunes `~/.cache/*` and old Claude transcripts — extend it to also prune `data/logs/idle-skip.log` files with mtime >30d and expired marker JSON files.
- The `has_busy_markers` check must be CHEAP — idle detector tick runs every 60s across every project. Reading a small JSON file per project is fine; anything heavier (DB query, stat + parse of many files) warrants a cache.
- Hook handler must be FAST (timeout 5s) and FAIL-SAFE (never block Claude). Swallow all errors; log to stderr only.

</specifics>

<deferred>
## Deferred Ideas

- Manual pin/unpin override (user rejected this approach in discussion — full automation only)
- Web UI to inspect current busy markers per session (not needed until false positives reported)
- Historical telemetry / dashboard of "how many auto-close skips / week" (nice-to-have)
- Cross-host marker sync (irrelevant — tmux sessions are host-local)
- Marker-based "Claude is busy" state shown on mobile lock-screen notifications

</deferred>

---

*Phase: 49-idle-detector-busy-work-awareness*
*Context gathered: 2026-04-18 via direct authorization*
