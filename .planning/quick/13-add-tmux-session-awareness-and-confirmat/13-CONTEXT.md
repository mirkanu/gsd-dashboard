# Quick Task 13: Add tmux session awareness and confirmation dialogs to autopilot - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Task Boundary

Add tmux session state checking and user confirmation to autopilot command delivery. Before sending a GSD command into a tmux session, check if idle or busy. Show a confirmation on the dashboard card before proceeding. If busy, offer to queue until idle.

</domain>

<decisions>
## Implementation Decisions

### Confirmation UX
- Inline on the card: when autopilot wants to send a command, the card shows the pending command with Confirm/Cancel buttons instead of silently firing. Uses the existing autopilot_progress WebSocket channel to push a "pending_confirmation" status to the UI.
- No modal — keeps it non-blocking so the user can see other cards.

### Queue behavior
- When session is busy and user confirms "queue", the backend polls waitForIdle with a generous timeout (5 minutes). If timeout exceeded, broadcast a "queue_timeout" status and stop the run for that phase — don't silently retry forever.
- User can cancel a queued command by clicking Pause on the card (existing pause mechanism).

### Auto-run scope
- Every phase in the autopilot loop checks session state and requests confirmation. The autopilot is not fully autonomous — it's "assisted autopilot" where the user confirms each command send. This matches the user's workflow (single developer, wants to see what's happening).
- The confirmation step is in the AutopilotManager tick loop, not in processSpawner. processSpawner remains a dumb "wait for idle then send" tool.

### Claude's Discretion
- All areas — user said "do what you think best"

</decisions>

<specifics>
## Specific Ideas

- New autopilot_progress statuses: `pending_confirmation` (waiting for user to confirm), `queued` (user confirmed, waiting for idle), `queue_timeout` (gave up waiting)
- New REST endpoint: POST /api/autopilot/confirm — user confirms the pending command
- AutopilotManager gets a `_pendingConfirmation` flag that pauses the tick loop until confirmed via REST call
- AutopilotControls component renders the confirmation UI when status is `pending_confirmation`

</specifics>
