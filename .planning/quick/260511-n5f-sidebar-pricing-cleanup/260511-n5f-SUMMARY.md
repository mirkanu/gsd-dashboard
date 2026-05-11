---
quick_id: 260511-n5f
slug: sidebar-pricing-cleanup
date: 2026-05-11
status: complete
commit: 189c4f1
---

# Summary

Completed three sidebar cleanup items:

1. **Pricing hidden by default** — session cost (`ProjectMetadata`) and weekly usage gauge (`UsagePanel` in `ProjectDetailsPanel`) are now hidden unless the user enables "Show pricing in project sidebar" in `/usage → Display Preferences`. Toggle persists in `localStorage` and updates all components live via storage events.

2. **Plan All + Run Autopilot removed** — both buttons stripped from `AutopilotControls`. Active autopilot UI (Pause/Resume/Confirm/Cancel and status indicators) preserved unchanged.

3. **Open Terminal hidden on desktop** — `ProjectControls` now accepts `hideOpenTerminal` prop. `ProjectDetailsPanel` (desktop right panel) passes `hideOpenTerminal={true}`, removing the redundant button since the terminal is always embedded in the middle column. `GsdDrawer` (mobile) is unaffected.
