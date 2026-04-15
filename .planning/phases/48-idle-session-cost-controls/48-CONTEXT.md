# Phase 48: Idle Session Cost Controls - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Measure per-tmux RSS and Railway $/day cost (surface in Services/Usage UI), detect idle Claude sessions, and auto-close them via a graceful shutdown sequence that runs `/gsd:pause-work` inside the session before killing the tmux. Includes a global config for the idle threshold and unifies the existing manual Pause button with the same graceful shutdown path.

</domain>

<decisions>
## Implementation Decisions

### Idle Detection
- **Signal:** Status = `waiting` AND terminal pane hash unchanged — both must hold (reuses Phase 43 `paneHashCache` infra + existing status detection).
- **Default threshold:** 2 hours idle → auto-close.
- **Working sessions:** Only auto-closed if `working` for >6 hours (treated as hung/stuck, force-kill without handoff).
- **Paused sessions:** N/A — paused already means tmux killed (existing Pause button). No separate handling.
- **Autopilot sessions:** 2× threshold (default 4h) — may legitimately be between actions.

### Graceful Shutdown Sequence (shared primitive)
Used by BOTH auto-idle-close AND the manual Pause button.

1. Send-keys `/gsd:pause-work\n` into the tmux pane (safe because auto-close is gated on `waiting`; manual Pause also safe — user-initiated).
2. Watch for pause-work completion marker (commit output / STATE.md write — planner/researcher will inspect actual `/gsd:pause-work` output format for reliable signal) + short buffer.
3. Kill tmux session.

**On pause-work failure/timeout:** Kill tmux anyway + Telegram notification "pause-work failed, manual checkpoint needed for project X".

**Manual Pause button:** Becomes "graceful pause" — same sequence as auto-idle. No separate fast/immediate path.

**6h-stuck working case:** Can't handoff a hung session — force-kill without attempting pause-work.

### Config Scope
- **Granularity:** Global setting only (one idle timeout for all projects — per-project overrides deferred).
- **Default state on deploy:** Enabled by default at 2h threshold — no opt-in required.
- **Pre-kill warning:** None. Threshold hit → graceful-shutdown fires immediately.
- **Post-kill notification:** Telegram message after kill ("killed session X, handoff saved" or failure variant).

### Cost Measurement & Surface
- **Computation:** Live `ps` RSS × Railway RAM rate (~$10/GB-month). Instantaneous approximation — accuracy is not critical, this is a rough guide.
- **Per-session display:** New column on the Services page showing $/day per tmux session.
- **Aggregate display:** Banner on the Usage page showing total idle $/day (sum across sessions that meet idle criteria).
- **Historical tracking:** Log daily to the existing `external_service_costs` table (reuses Phase 45 cost history infra — shows up in existing cost views).

### Claude's Discretion
- Railway rate constant location (env var vs settings table vs hardcoded).
- Exact pause-work completion-detection regex / marker (depends on actual `/gsd:pause-work` output).
- Grace buffer duration between pause-work success and tmux kill.
- Telegram message format/content.
- Whether cost column sorts by $/day or stays in current Services page order.

</decisions>

<specifics>
## Specific Ideas

- User framing: "I think quite a lot due to RAM usage" — mental model is 4GB idle × ~$0.33/GB-day ≈ $40/mo per idle tmux. Phase should make this number visible and automatable.
- Unify manual Pause button with auto-close graceful shutdown — avoid maintaining two kill paths.
- Existing Phase 43 terminal pane polling + `paneHashCache` is the right activity-signal foundation (don't build a new idle detector).
- Existing Phase 45 `external_service_costs` table is the right home for cost history (don't create a new table).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets (to be verified by planner/researcher)
- **Phase 43 `paneHashCache`** + `extractCurrentTask`: terminal pane change-detection already running on 2s poll — provides the "pane unchanged" signal.
- **Status detection (waiting/working/paused)**: already tracked per session — provides the "status=waiting" signal.
- **Phase 45 `external_service_costs` table**: daily cost history destination.
- **Phase 42 ConfigurationPage + `app_settings` SQLite table**: home for the global idle-timeout setting.
- **Existing Pause button** (`server/routes/...` tmux kill): to be refactored to call the shared graceful shutdown primitive.
- **Telegram notifier**: already wired for state transitions — reuse for post-kill notifications.
- **Services page** (`client/` ServicesPage): target for new $/day column.
- **Usage page** (quick task 37 + Phase 41/44): target for aggregate idle-cost banner.

### Established Patterns
- **Proxy mode gotcha (Phase 45 post-deploy bug):** Any new `/api/*` route MUST be added to `server/routes/proxy.js` PROXY_PREFIXES or Railway will shadow it. Plan-checker should flag this.
- **SQLite-first config:** Credentials and settings live in SQLite, not env vars — survives redeploy, editable via UI.
- **2s recursive setTimeout poll cadence** (Phase 43) — reuse, don't add a new interval.

### Integration Points
- Idle detector: runs alongside existing pane-hash poller in `server/`.
- Graceful shutdown primitive: new server-side helper callable from both (a) the idle detector and (b) the Pause button route.
- Cost measurement: new `/api/services/tmux-cost` route (add to PROXY_PREFIXES).
- Config: new field in `app_settings` + new section in ConfigurationPage.

</code_context>

<deferred>
## Deferred Ideas

- **Per-project threshold overrides** — Global-only for now. Revisit if one project gets falsely killed repeatedly.
- **Whitelist ("never auto-close project X")** — Same as above; add if global threshold proves too blunt.
- **Pre-kill warning / grace period with cancellation** — No warning in v1; add if users complain about surprise kills.
- **Railway Metrics API for precise cost** — Using `ps` RSS is simpler and approximate is fine. Upgrade to Railway API if accuracy becomes important (PAT already stored from Phase 45).
- **Separate `tmux_cost_history` table** — Reusing `external_service_costs` for now. Split if it pollutes the services cost view.

</deferred>

---

*Phase: 48-idle-session-cost-controls*
*Context gathered: 2026-04-15*
