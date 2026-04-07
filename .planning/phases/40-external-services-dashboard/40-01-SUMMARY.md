---
phase: 40-external-services-dashboard
plan: "01"
subsystem: services-dashboard
tags: [services, status, monitoring, ui]
dependency_graph:
  requires: []
  provides: [GET /api/services/status, ServicesPage, sidebar-services-nav]
  affects: [server/index.js, gsd-projects.json, client/src/App.tsx, client/src/components/Sidebar.tsx]
tech_stack:
  added: []
  patterns: [Promise.allSettled, AbortSignal.timeout, status-normalization]
key_files:
  created:
    - server/routes/services.js
    - client/src/pages/ServicesPage.tsx
  modified:
    - server/index.js
    - gsd-projects.json
    - client/src/App.tsx
    - client/src/components/Sidebar.tsx
decisions:
  - "Services field added to all non-archived projects; gsdTelegram (archived) has no services field"
  - "gsddashboard and debates include Vercel in addition to Railway/GitHub/Claude/OpenAI per plan spec"
  - "fetchStatus always resolves — never rejects — so Promise.allSettled is used for explicit parallelism and safety"
  - "Status normalization handles both Atlassian (indicator object) and plain string formats for Railway instatus compatibility"
metrics:
  duration_seconds: 468
  completed_date: "2026-04-06"
  tasks_completed: 2
  files_changed: 6
requirements: [COST-01, COST-02]
---

# Phase 40 Plan 01: External Services Dashboard Summary

**One-liner:** Live external service status dashboard using Promise.allSettled + Atlassian/plain normalization, grouped by project.

## What Was Built

- `GET /api/services/status` — server endpoint that reads `gsd-projects.json`, fetches all unique service status URLs in parallel with 5-second timeouts, normalizes responses to `operational | degraded | outage | unknown`, and returns results grouped by project.
- `ServicesPage` React component — shows project cards with colored status pills (emerald/yellow/red/gray), skeleton loading state (3 placeholder cards), error state with retry button, and a refresh button that re-fetches on demand.
- Sidebar "Services" nav item using the `Server` icon from lucide-react, placed after "GSD Projects" in `PRIMARY_ITEMS`.
- Route `/services` registered in App.tsx.
- `gsd-projects.json` updated: all 7 non-archived projects have a `services` array (Railway, GitHub, Claude, OpenAI); gsddashboard and debates also include Vercel.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] `server/routes/services.js` exists and loads without errors
- [x] `client/src/pages/ServicesPage.tsx` created (> 80 lines)
- [x] Client build passes cleanly (0 TS errors)
- [x] `gsd-projects.json` contains `services` field
- [x] Task 1 commit: `a84af94`
- [x] Task 2 commit: `983437b`
