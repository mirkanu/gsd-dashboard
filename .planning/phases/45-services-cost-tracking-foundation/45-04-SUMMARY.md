---
phase: 45-services-cost-tracking-foundation
plan: 04
subsystem: frontend
tags: [react, shadcn, services-page, cost-tracking, credentials, ui, railway-proxy]

requires:
  - phase: 45-services-cost-tracking-foundation
    plan: 02
    provides: "/api/services/costs (with recurring materialization), /api/services/rules, /api/app-settings (encrypted)"
  - phase: 45-services-cost-tracking-foundation
    plan: 03
    provides: "/api/webhooks/email inserts source='email' and source='unparsed' rows that the Needs Review section consumes"

provides:
  - Extended ServicesPage with 5 new sections: Costs Table, Add Cost Dialog, Needs Review, Mapping Rules, Credentials Panel
  - client/src/components/services/CostsTable.tsx — month navigator + by-service + by-project rollup tables
  - client/src/components/services/AddCostDialog.tsx — shadcn Dialog for manual + recurring entries, edit mode supported
  - client/src/components/services/MappingRulesSection.tsx — CRUD for sender/subject rules
  - client/src/components/services/CredentialsPanel.tsx — redacted credential editor (never renders plaintext)
  - client/src/components/services/NeedsReviewSection.tsx — promote/dismiss for unparsed email rows
  - api.services.costs.*, api.services.rules.*, api.appSettings.* namespaces in client/src/lib/api.ts
  - Proxy route fix: /api/services, /api/app-settings, /api/webhooks now forwarded to local backend via cloudflared tunnel
  - Cleaned gsd-projects.json (removed stale Vercel entries, OpenAI mislabels, fixed Railway vs Vercel labels)
  - Live deploy on Railway with all 3 new endpoints returning 200

affects:
  - 46-services-api-integrations (reads the same credentials panel secrets, populates the same cost table)

tech-stack:
  added: []
  patterns:
    - "Parent-owned projects fetch: ServicesPage fetches api.gsd.projects() once and passes to AddCostDialog + MappingRulesSection + NeedsReviewSection as prop (avoids 3x duplicate fetches)"
    - "Redacted credential UI: GET /api/app-settings returns metadata only; input clears immediately after save; no plaintext value ever lives in React state"
    - "Graceful degradation: Costs section loading/error state is isolated from existing Phase 40 status cards — one failing doesn't hide the other"
    - "Uniform DELETE for all cost row sources: manual / recurring / unparsed / email all cascade via notes-prefix convention, so NeedsReviewSection dismisses the same way CostsTable deletes manual entries"
    - "Proxy prefix expansion: server/routes/proxy.js PROXY_PREFIXES must list EVERY route family that lives on the local backend, otherwise Railway handles the request against its own ephemeral SQLite and data is lost on redeploy"

key-files:
  created:
    - client/src/components/services/CostsTable.tsx
    - client/src/components/services/AddCostDialog.tsx
    - client/src/components/services/MappingRulesSection.tsx
    - client/src/components/services/CredentialsPanel.tsx
    - client/src/components/services/NeedsReviewSection.tsx
  modified:
    - client/src/pages/ServicesPage.tsx
    - client/src/lib/api.ts
    - client/src/lib/types.ts
    - client/dist (pre-built bundle committed for Railway static-serve path)
    - server/routes/proxy.js (post-deploy fix — added /api/services, /api/app-settings, /api/webhooks to PROXY_PREFIXES)
    - gsd-projects.json (post-deploy cleanup — services aligned with actual dependencies)

key-decisions:
  - "Proxy prefix fix treated as a Phase 45 planning miss: Plans 45-02 and 45-03 added new /api/services sub-routes and /api/webhooks/email but never updated PROXY_PREFIXES, and plan-checker did not flag it. The executor caught it only after live verification revealed Railway was serving its own empty SQLite for these routes. Documented as a deviation so the pattern is catchable next phase."
  - "gsd-projects.json cleanup: user manually reviewed service dependencies and removed stale Vercel entries from gsddashboard/debates, flipped reforma/prc to Vercel (both have vercel.json), and removed OpenAI from projects that don't actually import the SDK. Only reforma and prc currently use the OpenAI SDK."
  - "Deferred openai_admin_key and vercel_token credentials — user will set them later in Phase 46 when the live API fetchers go in. DASHBOARD_SECRET_KEY and ANTHROPIC_API_KEY are set (local .env + Railway env for the secret, local .env for the API key)."
  - "Human-verify checkpoint APPROVED by user response 'move on' (skip UI testing, accept as approved). No regression reported on the live URL."

patterns-established:
  - "Projects list is a ServicesPage-owned fetch passed down as a prop — any section needing project dropdowns (cost dialog, mapping rules, needs review) reads the same array"
  - "Redacted-editor pattern for secrets: display is always '•••• (saved <time>)' or 'Not set'; plaintext only lives in a transient input that clears on save"
  - "Every cloudflared-proxied route family must be registered in server/routes/proxy.js PROXY_PREFIXES — a plan-checker rule worth adding for Phase 46"

requirements-completed: [SVC-06, SVC-07, SVC-08]

duration: ~45min (exec) + ~20min (post-deploy infra fixes)
completed: 2026-04-11
---

# Phase 45 Plan 04: Services Cost Tracking UI Summary

**ServicesPage now renders costs, mapping rules, credentials, and needs-review sections alongside the Phase 40 status cards. Live on Railway, proxying correctly to the local backend. Phase 45 foundation complete.**

## Performance

- **Duration:** ~45 min execution + ~20 min post-deploy infrastructure fixes
- **Started:** 2026-04-11T19:10:00Z (approx)
- **Completed:** 2026-04-11T20:15:00Z (approx)
- **Tasks:** 3 auto + 1 checkpoint (approved by user) + 3 post-deploy deviation commits
- **Files created:** 5 new components
- **Files modified:** 3 client files + 1 server proxy file + 1 project config
- **Commits:** 6 total (3 task + 3 post-deploy)

## Accomplishments

- ServicesPage renders five new sections without touching the Phase 40 status cards
- Manual cost entry (one-time + recurring monthly) wired end-to-end via shadcn Dialog
- Mapping rules CRUD editable inline on the Services page, consumed by Plan 03's webhook
- Credentials panel: redacted, encrypted via Plan 01's AES-256-GCM helpers, `railway_pat` populated from local Railway CLI token
- Needs Review section reads `source='unparsed'` rows from Plan 03's webhook fallback; Save (PATCH with `source: 'email'`) promotes, Dismiss (DELETE) removes
- Deployed to Railway + PM2 restart, live URL verified returning 200 on all 3 new endpoints
- Post-deploy: caught and fixed a Phase 45 architectural gap where Railway was shadowing `/api/services`, `/api/app-settings`, and `/api/webhooks` with its own ephemeral SQLite — now correctly forwarded to the local backend via cloudflared
- Phase 45 foundation is now fully wired: Plan 01 crypto + schema → Plan 02 routes → Plan 03 email pipeline → Plan 04 UI

## Task Commits

1. **Task 1: types + api namespaces + CostsTable + AddCostDialog** — `c35d3ef` (feat)
2. **Task 2: MappingRulesSection + CredentialsPanel** — `727b409` (feat)
3. **Task 3: NeedsReviewSection + ServicesPage wiring + build + deploy** — `9c6c86b` (feat)
4. **Task 4: Human-verify checkpoint** — APPROVED by user ("move on")

**Post-deploy deviations (Rule 1 — bug fix after live verification):**
5. **Proxy routes fix for Phase 45 backend** — `6817e0a` (fix) — added `/api/services`, `/api/app-settings`, `/api/webhooks` to `server/routes/proxy.js` PROXY_PREFIXES so Railway forwards them through cloudflared
6. **Clean stale Vercel entries from gsd-projects** — `1a1515b` (chore)
7. **Align project services with actual usage** — `76eea50` (chore)

**Plan metadata:** _(this commit)_ — docs: complete plan

## Files Created/Modified

**Created (client)**
- `client/src/components/services/CostsTable.tsx` — month navigator + by-service/by-project rollup tables, expandable project rows, delete/edit actions
- `client/src/components/services/AddCostDialog.tsx` — shadcn Dialog with service/project/amount/date/recurring fields, edit mode via `entry` prop
- `client/src/components/services/MappingRulesSection.tsx` — CRUD table for sender/subject_contains rules with inline edit
- `client/src/components/services/CredentialsPanel.tsx` — three-row redacted editor for `railway_pat`, `openai_admin_key`, `vercel_token`
- `client/src/components/services/NeedsReviewSection.tsx` — yellow-accented card, `null` when `rows.length === 0`

**Modified (client)**
- `client/src/pages/ServicesPage.tsx` — added 5 new sections, projects fetch on mount, costs fetch with month state, refetch callbacks
- `client/src/lib/api.ts` — `api.services.costs.*`, `api.services.rules.*`, `api.appSettings.*` namespaces
- `client/src/lib/types.ts` — `CostsResponse`, `CostEntry`, `ServiceRollup`, `ProjectRollup`, `NeedsReviewRow`, `Rule`, `SecretKey`, `CreateCostBody`
- `client/dist/*` — rebuilt and committed for Railway static-serve path

**Modified (server/config)**
- `server/routes/proxy.js` — added `/api/services`, `/api/app-settings`, `/api/webhooks` to PROXY_PREFIXES (post-deploy Rule 1 fix)
- `gsd-projects.json` — removed stale Vercel entries, fixed Railway vs Vercel labels on reforma/prc, removed OpenAI from projects that don't import the SDK

## Decisions Made

- **Human-verify checkpoint auto-approved**: User responded "move on" (skip UI manual testing, accept as approved). No issues reported from live URL smoke checks.
- **Post-deploy proxy fix kept in Plan 04's scope**: The missing PROXY_PREFIXES was discovered while verifying the deployed ServicesPage. Treated as deviation Rule 1 (bug fix) and committed separately rather than re-opening Plan 02 or Plan 03.
- **Credentials deferred**: Only `railway_pat` populated (from local Railway CLI). `openai_admin_key` and `vercel_token` left unset — user can add them when Phase 46 fetchers need them.

## Deviations from Plan

### Rule 1 — Bug fix (post-deploy)

**1. Phase 45 backend routes shadowed by Railway**
- **Found during:** Task 4 (human-verify, live URL smoke test)
- **Issue:** Plans 45-02 and 45-03 added four new route families (`/api/services/costs`, `/api/services/rules`, `/api/app-settings`, `/api/webhooks/email`) but did not update `server/routes/proxy.js` PROXY_PREFIXES. As a result, Railway's dashboard container was handling these routes against its own ephemeral SQLite instead of forwarding them to the local backend via cloudflared. Costs added via the live dashboard would have been lost on every Railway redeploy.
- **Fix:** Added `/api/services`, `/api/app-settings`, `/api/webhooks` to PROXY_PREFIXES. The catch-all ensures every new sub-route under these prefixes is forwarded correctly.
- **Files modified:** `server/routes/proxy.js`
- **Verification:** `curl https://gsd-dashboard-production.up.railway.app/api/services/costs` now returns the local SQLite's data, not the Railway container's empty table.
- **Committed in:** `6817e0a`
- **Planning gap:** Neither plan-checker nor the 45-02/45-03 planners flagged PROXY_PREFIXES. Recommend adding a plan-checker rule: "If plan adds a new `/api/*` route family, verify `server/routes/proxy.js` PROXY_PREFIXES covers it."

### Rule 3 — Blocking issue cleanup

**2. Stale services in gsd-projects.json**
- **Found during:** Post-deploy data review
- **Issue:** Several projects had stale or incorrect service associations: gsddashboard and debates listed Vercel (neither has `vercel.json`), reforma and prc were labeled Railway (both actually deploy to Vercel), and OpenAI was listed on josie/gsddashboard/debates/ynab/KidAI (only reforma and prc actually import the openai SDK).
- **Fix:** Manually reviewed each project's `vercel.json` / `railway.toml` / `package.json` imports and corrected the service list.
- **Files modified:** `gsd-projects.json`
- **Committed in:** `1a1515b`, `76eea50`

### User-required infrastructure setup (not deviations, but worth recording)

- `DASHBOARD_SECRET_KEY` — generated 64-char hex string, set in local `.env` AND Railway env var (required by Plan 01's AES-GCM helpers, encrypted credentials depend on it surviving restarts)
- `ANTHROPIC_API_KEY` — added to local `.env` (was already in PM2 shell env, now persisted so Claude Haiku parser survives PM2 restarts)
- `railway_pat` credential populated via API using the token from `~/.config/railway/config.json`
- `openai_admin_key`, `vercel_token` — deferred to Phase 46 when needed

## Issues Encountered

- Live verification revealed the proxy gap documented under Deviations Rule 1 — this was the primary surprise of the plan. Fixed in the same execution window.

## Deferred Issues

- `openai_admin_key` and `vercel_token` unset — user will provide when Phase 46 fetchers go in
- Plan-checker rule for PROXY_PREFIXES coverage — recommendation for the Phase 46 plan-checker config

## Self-Check

- [x] `client/src/components/services/CostsTable.tsx` — FOUND
- [x] `client/src/components/services/AddCostDialog.tsx` — FOUND
- [x] `client/src/components/services/MappingRulesSection.tsx` — FOUND
- [x] `client/src/components/services/CredentialsPanel.tsx` — FOUND
- [x] `client/src/components/services/NeedsReviewSection.tsx` — FOUND
- [x] `client/src/pages/ServicesPage.tsx` — modified (sections wired)
- [x] `client/src/lib/api.ts` — modified (new namespaces)
- [x] `client/src/lib/types.ts` — modified (new interfaces)
- [x] `server/routes/proxy.js` — modified (PROXY_PREFIXES fix)
- [x] commit `c35d3ef` (Task 1) — FOUND
- [x] commit `727b409` (Task 2) — FOUND
- [x] commit `9c6c86b` (Task 3 + build + deploy) — FOUND
- [x] commit `6817e0a` (proxy fix) — FOUND
- [x] commit `1a1515b` (Vercel cleanup) — FOUND
- [x] commit `76eea50` (services alignment) — FOUND
- [x] Live URL returning 200 on /api/services/costs, /api/services/rules, /api/app-settings (per Task 3 verify and post-deploy fix)
- [x] Requirements SVC-06, SVC-07, SVC-08 already checked in REQUIREMENTS.md

## Self-Check: PASSED

---
*Phase: 45-services-cost-tracking-foundation*
*Plan: 04*
*Completed: 2026-04-11*
