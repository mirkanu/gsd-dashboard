---
phase: 54B
plan: "03"
subsystem: client-ui
tags: [notifications, react, config-page, api-client]
dependency_graph:
  requires: [54B-01, 54B-02]
  provides: [notification-policy-ui, api-notifications-namespace]
  affects: [client/src/lib/api.ts, client/src/pages/ConfigPage.tsx]
tech_stack:
  added: []
  patterns: [self-fetching-panel, role-switch-toggle, optimistic-save-feedback]
key_files:
  created:
    - client/src/components/NotificationPolicyPanel.tsx
  modified:
    - client/src/lib/api.ts
    - client/src/pages/ConfigPage.tsx
decisions:
  - ConfigPage uses a single scrolling layout (no tabs) — panel added as a section after Idle Auto-Close
  - Toggle component co-located in NotificationPolicyPanel.tsx (not imported from ConfigPage)
  - rate_limit_per_hour clamped to 1–100 on client onChange (T-54B-03-A mitigation)
metrics:
  duration_minutes: 8
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  completed_date: "2026-05-30"
---

# Phase 54B Plan 03: Notification Policy UI Summary

Self-fetching NotificationPolicyPanel component with 10-event toggles, quiet hours (UTC), rate limit, and save/test actions; wired as a new section in ConfigPage.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add api.notifications namespace + NotificationPolicy type | aa2f2d8 | client/src/lib/api.ts |
| 2 | Create NotificationPolicyPanel + wire ConfigPage | 97e72b8 | client/src/components/NotificationPolicyPanel.tsx, client/src/pages/ConfigPage.tsx |

## What Was Built

**`client/src/lib/api.ts`**
- `NotificationPolicy` interface exported (enabled, quiet_hours_from/to, rate_limit_per_hour, event_toggles)
- `api.notifications` namespace: `getPolicy` (GET), `savePolicy` (PUT), `sendTest` (POST)

**`client/src/components/NotificationPolicyPanel.tsx`**
- Self-fetching panel: loads policy on mount via `api.notifications.getPolicy`; falls back to defaults on error
- Global enable toggle (Bell/BellOff icon swap)
- Quiet hours: two `type="time"` inputs with UTC helper text; disables when global toggle is off
- Rate limit: `type="number"` min=1 max=100 with client-side clamping (T-54B-03-A mitigation)
- 10 event toggles matching ROADMAP NTF-02 defaults (5 on, 5 off)
- All toggles use `role="switch"` with `aria-checked`
- Send Test button with sending/ok/error feedback states
- Save Settings button with saving/saved feedback states

**`client/src/pages/ConfigPage.tsx`**
- Import added for `NotificationPolicyPanel`
- New "Notification Policy" section added after Idle Auto-Close with Bell icon header
- Deprecation notice added to legacy Telegram Alerts section pointing to new section

## Decisions Made

1. **Section layout over tabs**: ConfigPage uses a single scrolling layout with no tab structure. The panel was added as a new card section rather than inventing a new tab system. This matches the existing page architecture.
2. **Toggle co-location**: The `Toggle` component is duplicated inside `NotificationPolicyPanel.tsx` rather than imported from `ConfigPage.tsx` — `ConfigPage` doesn't export it and importing from a page file would be a circular/bad-pattern dependency.
3. **Client clamping**: `rate_limit_per_hour` is clamped on `onChange` (1–100) per the threat model T-54B-03-A mitigation. Server validates independently.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with one structural note:

**Structural note: ConfigPage has no tabs**
The plan described adding a "Notifications tab" but the actual `ConfigPage.tsx` has no tab structure — it's a flat scrolling page of card sections. The panel was added as a named section ("Notification Policy") which achieves the same UX goal without inventing new navigation infrastructure. The plan's tab-add steps (steps 2–4 in Task 2 action) were interpreted as: add import + render panel in a new section.

## Known Stubs

None. The panel is fully wired to `api.notifications.getPolicy/savePolicy/sendTest`. It falls back to `DEFAULT_POLICY` if the server returns an error (e.g., if Plan 02 API routes are not yet deployed), which is intentional and safe.

## Threat Flags

No new security-relevant surface introduced. The panel calls existing API routes (built in Plan 02). Client-side clamping of `rate_limit_per_hour` implements T-54B-03-A mitigation.

## Self-Check: PASSED

- [x] `client/src/components/NotificationPolicyPanel.tsx` exists
- [x] `export function NotificationPolicyPanel` present
- [x] `role="switch"` toggles present
- [x] `type="time"` inputs present with UTC helper text
- [x] `api.notifications` calls present
- [x] `NotificationPolicyPanel` imported and rendered in `ConfigPage.tsx`
- [x] Commit `aa2f2d8` exists (Task 1)
- [x] Commit `97e72b8` exists (Task 2)
- [x] No TS errors introduced by new/modified files (pre-existing errors in GSD.tsx and test files are out of scope)
