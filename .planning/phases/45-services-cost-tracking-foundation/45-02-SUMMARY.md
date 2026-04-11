---
phase: 45-services-cost-tracking-foundation
plan: 02
subsystem: api-routes
tags: [express, sqlite, better-sqlite3, credentials, aes-gcm, cost-rollup, recurring-materialization, mapping-rules]

requires:
  - phase: 45-services-cost-tracking-foundation
    plan: 01
    provides: Phase 45 schema (app_settings, manual_cost_entries, service_mapping_rules, processed_emails, external_service_costs additive columns) + server/crypto.js helpers

provides:
  - GET/PUT/DELETE /api/app-settings — encrypted credential CRUD with never-leak redaction
  - GET/POST/PATCH/DELETE /api/services/costs — monthly cost rollup with recurring on-read materialization
  - GET/POST/PATCH/DELETE /api/services/rules — sender/subject mapping rules CRUD
  - notes='manual:<id>' / 'recurring:<id>' / 'email:<msgid>' cascade convention for uniform CRUD on external_service_costs.id
  - Current-month-only materialization guard (historical months are frozen)

affects:
  - 45-03 (email webhook pipeline — consumes /api/services/rules and writes to external_service_costs)
  - 45-04 (Services page UI — calls /api/services/costs + /api/app-settings + /api/services/rules)
  - 46-services-api-integrations (consumes /api/app-settings for Railway PAT, OpenAI admin key, Vercel token)

tech-stack:
  added: []  # uuid was already a dep; no new packages
  patterns:
    - "Prepared-statement ownership split: schema in db.js, statements in the route that uses them"
    - "Transaction-wrapped multi-table writes (manual_cost_entries + external_service_costs) to keep link integrity"
    - "On-read recurring materialization guarded to current calendar month (no backfill)"
    - "notes prefix (manual:/recurring:/email:) as a lightweight link table substitute"
    - "Sub-route mounted BEFORE base router so /api/services/rules resolves before /api/services catch-all"

key-files:
  created:
    - server/routes/app-settings.js
    - server/routes/services-rules.js
    - server/__tests__/app-settings-route.test.js
    - server/__tests__/services-costs-route.test.js
  modified:
    - server/routes/services.js
    - server/index.js

key-decisions:
  - "Sub-route mount order matters: /api/services/rules is mounted BEFORE /api/services so the rules sub-router wins against the catch-all"
  - "Recurring materialization runs on-read (not via cron) and is strictly guarded to current calendar month — past months return only stored rows, never synthesized ones"
  - "DELETE of a 'recurring:<muid>' row also deletes the underlying manual_cost_entries template to stop future materializations; other months' materialized rows survive"
  - "PATCH of a 'recurring:<muid>' row does NOT cascade to the template — this month's value edits are local, template edits require delete + recreate"
  - "Uniform UI contract: all DELETE/PATCH calls go through external_service_costs.id regardless of source ∈ {manual, recurring, email, unparsed}; server inspects notes prefix to decide cascade behavior"
  - "POST of a recurring entry creates ONLY the manual_cost_entries template — no external_service_costs row until next GET materializes it"
  - "/api/services/status route is not modified — strictly additive surface area to preserve Phase 40 consumers"

requirements-completed: [SVC-06, SVC-07, SVC-08]

duration: ~14min
completed: 2026-04-11
---

# Phase 45 Plan 02: Services Cost Routes Summary

**Backend routes exposing Phase 45 storage: encrypted credentials CRUD, manual cost CRUD with recurring on-read materialization, and sender/subject mapping rules CRUD.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-04-11T18:48:50Z
- **Completed:** 2026-04-11T19:03:09Z
- **Tasks:** 3 (all TDD, all auto)
- **Files created:** 4 (2 routes, 2 test files)
- **Files modified:** 2 (server/routes/services.js, server/index.js)

## Accomplishments

- `/api/app-settings` CRUD — encrypted credential storage, never exposes plaintext or ciphertext
- `/api/services/costs` CRUD + monthly rollup with services[], projects[], needs_review[], entries[]
- Recurring materialization idempotent within a month AND guarded to current month only
- Uniform DELETE/PATCH on `external_service_costs.id` with notes-based cascade to `manual_cost_entries`
- `/api/services/rules` CRUD with pattern_type validation
- `/api/services/status` untouched — strictly additive surface area
- 28 new integration tests (7 app-settings + 21 services-costs/rules); all Phase 45 test targets pass 35/35

## Task Commits

1. **Task 1 RED: failing app-settings route tests** — `1db11f7` (test)
2. **Task 1 GREEN: /api/app-settings route + wiring** — `351658a` (feat)
3. **Task 2+3 RED: failing services/costs + services/rules tests** — `6837ebf` (test)
4. **Task 2 GREEN: /api/services/costs CRUD + rollup** — `927196c` (feat)
5. **Task 3 GREEN: /api/services/rules CRUD + wiring** — `a3554b0` (feat)

**Plan metadata commit:** _(this commit)_ — docs: complete plan

## Files Created/Modified

### Created

- `server/routes/app-settings.js` — Credential CRUD; GET list/item never return ciphertext, PUT encrypts via `setSecret`, DELETE removes row
- `server/routes/services-rules.js` — `service_mapping_rules` CRUD with `pattern_type ∈ {sender, subject_contains}` validation
- `server/__tests__/app-settings-route.test.js` — 7 integration tests (round-trip, redaction, list, validation, delete+404, empty list)
- `server/__tests__/services-costs-route.test.js` — 21 integration tests (POST/GET/PATCH/DELETE, recurring materialization current-month guard, unparsed promote/dismiss, rules CRUD, status backward-compat)

### Modified

- `server/routes/services.js` — Appended /costs CRUD block with prepared statements, month helpers, `materialize` transaction, POST/GET/PATCH/DELETE handlers. Added `uuid` + `db` requires at top.
- `server/index.js` — Registered `appSettingsRouter` at `/api/app-settings` and `servicesRulesRouter` at `/api/services/rules` (mounted BEFORE `/api/services` to win against the catch-all). `webhooksEmailRouter` wiring was introduced by Plan 03 executing in parallel — left intact.

## Decisions Made

See `key-decisions` in frontmatter. Highlights:

- Sub-route mount order is load-bearing — `/api/services/rules` must precede `/api/services`
- Recurring materialization is on-read and strictly current-month-only — no backfill, no cron
- DELETE/PATCH are uniform across all sources via the `notes` prefix linking convention
- Deleting a recurring row stops future materializations by removing the template; past months untouched
- PATCH of recurring-materialized rows is local to the month — does NOT cascade to the template

## Deviations from Plan

- **Rule 3 (blocking): Plan mounted `/api/services/rules` AFTER `/api/services`**, but the existing `/api/services/status` catch-all would have shadowed `/rules`. Changed mount order so `/api/services/rules` is registered before `/api/services`. This was required for the rules tests to pass.
- **Parallel Plan 03 interaction:** While this plan was executing, Plan 03 added a `webhooksEmailRouter` import + mount in `server/index.js`. I preserved that addition and merged my `servicesRulesRouter` mount alongside it — no conflicts, purely additive.
- **Test file naming:** Plan's Task 3 action asked to append rules tests to the same file as Task 2. Done — `services-costs-route.test.js` covers both /costs and /rules CRUD.

## Issues Encountered

- **Full `npm run test:server` suite hangs** — matches the pre-existing behavior documented in 45-01-SUMMARY.md deferred-items (autopilotManager.test.js, api.test.js). Out of scope per execution rules. All Phase 45 targets run green in isolation: `node --test server/__tests__/{crypto,app-settings-route,services-costs-route}.test.js` → 35/35 passing.

## Deferred Issues

None introduced by this plan. See `deferred-items.md` in phase directory for pre-existing suite hang.

## User Setup Required

None for Plan 02 itself. Once Plan 04 (Credentials UI) ships, the user will set credentials via the panel. CLI smoke test commands (covered by plan's `<verification>` block):

```bash
curl http://localhost:3001/api/app-settings                 # → {keys:[]}
curl -X PUT http://localhost:3001/api/app-settings/railway_pat \
     -H 'Content-Type: application/json' -d '{"value":"rp_test"}'
curl http://localhost:3001/api/services/costs               # → {month,services,projects,needs_review,entries}
curl http://localhost:3001/api/services/status              # → unchanged Phase 40 response
curl http://localhost:3001/api/services/rules               # → {rules:[]}
```

## Next Phase Readiness

- Plan 03 (email pipeline) can write `external_service_costs` rows with `source='email'` and `notes='email:<msgid>'` and they will flow through the same rollup + delete contract
- Plan 04 (Services UI) has a stable `api.services.costs.*` / `api.services.rules.*` / `api.appSettings.*` surface to bind to
- Phase 46 (API integrations) can call `getSecret('railway_pat' | 'openai_admin_key' | 'vercel_token')` server-side without going through HTTP

## Self-Check

- [x] `server/routes/app-settings.js` — FOUND
- [x] `server/routes/services-rules.js` — FOUND
- [x] `server/__tests__/app-settings-route.test.js` — FOUND
- [x] `server/__tests__/services-costs-route.test.js` — FOUND
- [x] `server/routes/services.js` — MODIFIED (uuid + /costs block appended)
- [x] `server/index.js` — MODIFIED (two new router mounts)
- [x] Commit 1db11f7 — FOUND
- [x] Commit 351658a — FOUND
- [x] Commit 6837ebf — FOUND
- [x] Commit 927196c — FOUND
- [x] Commit a3554b0 — FOUND
- [x] 7/7 app-settings route tests pass
- [x] 21/21 services-costs + services-rules tests pass
- [x] 35/35 Phase 45 test targets pass in combined run

## Self-Check: PASSED

---
*Phase: 45-services-cost-tracking-foundation*
*Plan: 02*
*Completed: 2026-04-11*
