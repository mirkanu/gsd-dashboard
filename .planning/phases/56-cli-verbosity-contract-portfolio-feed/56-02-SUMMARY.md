---
phase: 56-cli-verbosity-contract-portfolio-feed
plan: "02"
subsystem: client
tags: [portfolio-feed, feed-page, event-badge, dashboard, config-toggles, routing]
dependency_graph:
  requires:
    - 56-01 (GET /api/feed route, suppress_* DB columns)
  provides:
    - client/src/components/EventTypeBadge.tsx (LandmarkEventType, EventTypeBadge)
    - client/src/pages/FeedPage.tsx (full feed page with load-on-mount + WS live updates)
    - client/src/App.tsx (/feed route, /activity -> /feed redirect)
    - client/src/components/Sidebar.tsx (Feed nav entry with Rss icon)
    - client/src/lib/types.ts (FeedEntry interface, ProjectSettings suppress_* fields)
    - client/src/pages/Dashboard.tsx (Portfolio Feed preview replacing Recent Activity)
    - client/src/pages/ConfigPage.tsx (GSD Verbosity Overrides section with 2 toggles)
  affects:
    - client/src/pages/Dashboard.tsx
    - client/src/pages/ConfigPage.tsx
    - client/src/components/Sidebar.tsx
    - client/src/App.tsx
    - client/src/lib/types.ts
tech_stack:
  added: []
  patterns:
    - load-on-mount + useCallback pattern (matching EnvEditorPage)
    - eventBus.subscribe return value used directly as cleanup (FeedPage, Dashboard)
    - saveSettings merge extended to include new boolean fields
    - handleGsdToggle pattern matching existing handleAlertToggle
key_files:
  created:
    - client/src/components/EventTypeBadge.tsx
    - client/src/pages/FeedPage.tsx
  modified:
    - client/src/App.tsx
    - client/src/components/Sidebar.tsx
    - client/src/lib/types.ts
    - client/src/pages/Dashboard.tsx
    - client/src/pages/ConfigPage.tsx
decisions:
  - Removed recentEvents state and api.events.list call from Dashboard entirely — no longer needed after Recent Activity section replaced by Portfolio Feed
  - AgentStatusBadge and DashboardEvent imports cleaned up from Dashboard as they became unused
  - eventBus.subscribe return value used directly as useEffect cleanup (pattern matches existing Dashboard usage)
  - suppress_* fields added to saveSettings merge object so PUT body always carries both values
metrics:
  duration_minutes: 18
  completed_date: "2026-05-09"
  tasks_completed: 2
  files_created: 2
  files_modified: 5
  tests_added: 0
  tests_passing: 144
  pre_existing_failures: 0
  new_failures: 0
requirements_satisfied:
  - NAR-02
  - NAR-03
  - NAR-04
  - NAR-05
---

# Phase 56 Plan 02: Client-Side Portfolio Feed and Config Toggle UI Summary

**One-liner:** EventTypeBadge + FeedPage with WS live updates + Dashboard Portfolio Feed preview replacing Recent Activity + ConfigPage GSD Verbosity Overrides toggles, all wired to the server routes from Plan 01.

## What Was Built

Client-side visible half of the Portfolio Feed feature:

1. **types.ts** — Added `FeedEntry` interface and extended `ProjectSettings` with `suppress_context_reask?: boolean` and `suppress_plan_ceremony?: boolean`.

2. **EventTypeBadge.tsx** — New component mapping 5 landmark event types to color-coded badges using the existing `badge` CSS class. Exports `EventTypeBadge` and `LandmarkEventType`.

3. **FeedPage.tsx** — Full feed page at `/feed`. Loads from `GET /api/feed` on mount, shows loading/error/empty states, subscribes to `feed_event` WS messages for live prepend. Uses EnvEditorPage's load-on-mount pattern.

4. **App.tsx** — Added `<Route path="feed" element={<FeedPage />} />`. Changed `/activity` redirect from `/` to `/feed`.

5. **Sidebar.tsx** — Added `Rss` import; inserted `{ to: "/feed", icon: Rss, label: "Feed" }` into `PRIMARY_ITEMS` between `/gsd` and `/services`.

6. **Dashboard.tsx** — Replaced "Recent Activity" section with "Portfolio Feed" preview (max 5 entries, "View All" links to `/feed`). Added `feedEvents` state, `/api/feed` fetch on mount, `feed_event` WS subscription. Removed now-unused `recentEvents` state, `DashboardEvent` import, and `AgentStatusBadge` import.

7. **ConfigPage.tsx** — Extended `saveSettings` merge to include `suppress_context_reask` and `suppress_plan_ceremony`. Added `handleGsdToggle` handler. Added "GSD Verbosity Overrides" section between "Claude Session Verbosity" and "Telegram Alerts" with 2 `Toggle` components.

## Test Results

- 144/144 client tests pass (0 new failures)
- TypeScript: no errors in any modified files (pre-existing errors only in GSD.tsx, ServerPage.tsx, Settings.tsx — out of scope)

## Commits

| Hash | Message |
|------|---------|
| c34ca2f | feat(56-02): EventTypeBadge, FeedPage, App routing, Sidebar Feed nav, FeedEntry type |
| ea48c1c | feat(56-02): Dashboard Portfolio Feed preview, ConfigPage GSD Verbosity Overrides |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Cleanup] Removed unused recentEvents state and related code from Dashboard.tsx**
- **Found during:** Task 2 — after replacing the Recent Activity section, `recentEvents`, `setRecentEvents`, `DashboardEvent` import, `AgentStatusBadge` import, and the `api.events.list` call in `load()` became unused.
- **Fix:** Removed all four unused items to prevent TypeScript warnings and keep the component clean.
- **Files modified:** client/src/pages/Dashboard.tsx
- **Commit:** ea48c1c

## Known Stubs

None — FeedPage and Dashboard preview fetch real data from `/api/feed`. Empty array on fresh server start is the correct initial state (no stubs or placeholder text).

## Threat Surface Scan

No new threat surface beyond what is in the plan's threat model (T-56-05 through T-56-07). All client components read from `/api/feed` (cookieAuth-protected) and write suppress_* booleans via the existing PUT `/api/config/project-settings` route.

## Self-Check: PASSED

All 7 key files verified:
- client/src/components/EventTypeBadge.tsx: created
- client/src/pages/FeedPage.tsx: created
- client/src/App.tsx: has /feed route and /activity -> /feed redirect
- client/src/components/Sidebar.tsx: has Rss import and Feed entry
- client/src/lib/types.ts: has FeedEntry and suppress_* fields
- client/src/pages/Dashboard.tsx: has Portfolio Feed preview
- client/src/pages/ConfigPage.tsx: has GSD Verbosity Overrides section
Both task commits verified: c34ca2f and ea48c1c in git log.
