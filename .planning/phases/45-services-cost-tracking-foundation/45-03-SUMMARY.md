---
phase: 45-services-cost-tracking-foundation
plan: 03
subsystem: backend
tags: [express, webhook, pipedream, anthropic, claude-haiku, sqlite, email-ingestion]

requires:
  - phase: 45-services-cost-tracking-foundation
    plan: 01
    provides: processed_emails table, service_mapping_rules table, external_service_costs additive columns (source, message_id, project_key, notes, currency, description, raw_body)

provides:
  - POST /api/webhooks/email (Pipedream inbound handler, async, never-bounce contract)
  - GET /api/webhooks/email (health check)
  - server/lib/pipedream.js — pure payload helpers (extractMessageId/Sender/Subject/Html/Date)
  - server/services/email-parser.js — Claude Haiku wrapper (parseServiceReceipt)
  - server/services/mapping-resolver.js — sender/subject rule resolver (resolveProjectKey)
  - 4 fixture payloads (Railway, OpenAI, Vercel, Anthropic)
  - Unit + integration test suite (39 passing tests)

affects:
  - 45-02 (services cost routes consume external_service_costs rows created here)
  - 45-04 (Services UI displays parsed rows; "Needs Review" section reads source=unparsed rows)
  - 46-services-api-integrations (same insert path pattern; live API fetchers will write source='api')

tech-stack:
  added:
    - "@anthropic-ai/sdk ^0.66.0"
  patterns:
    - "Webhook never-bounce contract: every path returns 200 {received:true, status:<outcome>}"
    - "Async parser + sync better-sqlite3 transaction: await parseServiceReceipt OUTSIDE db.transaction() closure"
    - "Dedup via INSERT OR IGNORE on processed_emails.message_id, changes===0 → duplicate"
    - "Whole-module require of parserModule so tests can monkey-patch parseServiceReceipt without cache shims"
    - "Parser null → unparsed fallback row with raw_body populated (never drop data)"
    - "extractDate always returns valid ISO (normalizes RFC 2822, falls back to now)"

key-files:
  created:
    - server/lib/pipedream.js
    - server/services/email-parser.js
    - server/services/mapping-resolver.js
    - server/routes/webhooks-email.js
    - server/__tests__/email-pipedream.test.js
    - server/__tests__/email-webhook.test.js
    - server/__tests__/fixtures/emails/railway.json
    - server/__tests__/fixtures/emails/openai.json
    - server/__tests__/fixtures/emails/vercel.json
    - server/__tests__/fixtures/emails/anthropic.json
  modified:
    - server/index.js
    - package.json
    - package-lock.json

key-decisions:
  - "Require parserModule as whole object (not destructured) so tests can monkey-patch parseServiceReceipt at runtime"
  - "Await async parser BEFORE entering better-sqlite3 transaction (better-sqlite3 txns are synchronous only)"
  - "Parser smoke test runs unconditionally when ANTHROPIC_API_KEY is present, skips cleanly otherwise (no brittle env gating)"
  - "Webhook GET health check mirrors ynab webhook contract — lets Pipedream validate endpoint before going live"
  - "extractDate normalizes RFC 2822 header dates to ISO because checked_at is strict ISO; fallback to now() prevents ingestion from ever failing on bad dates"
  - "resolveProjectKey honors optional per-rule service filter so a user can scope 'railway.app' rule to Railway-only (avoid accidental OpenAI match)"
  - "Service filter short-circuits only when BOTH rule.service and caller service are set — un-scoped rules stay broad"

patterns-established:
  - "Webhook never-bounce: all failure paths return 200 with a status tag; fatal exception wrapper catches any unexpected throw"
  - "Async-then-sync pattern: await external I/O first, THEN run db.transaction(() => { ... sync writes ... })"
  - "Test harness: isolated DB per test file via DASHBOARD_DB_PATH set before requires, beforeEach cleans test tables"

requirements-completed: [SVC-02]

duration: ~18min
completed: 2026-04-11
---

# Phase 45 Plan 03: Email Ingestion Pipeline Summary

**Pipedream webhook → Pipedream payload helpers → Claude Haiku parser → mapping resolver → SQLite insert. Tested against 4 fixture payloads, deduped by Message-ID, fail-safe unparsed fallback.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-11T18:49:17Z
- **Completed:** 2026-04-11T19:07:23Z
- **Tasks:** 3 (TDD — RED fixtures + failing tests, then GREEN helpers/parser/resolver, then GREEN webhook route + integration tests)
- **Files created:** 10
- **Files modified:** 3

## Accomplishments

- Fully operational email → cost-row pipeline with real Haiku integration (smoke test passes against live API, extracting $42.17 Railway fixture)
- 39 tests pass across `email-pipedream.test.js` (33) + `email-webhook.test.js` (6), including a live Haiku parser smoke test
- Never-bounce webhook contract: duplicate / missing-id / unparsed / fatal-error all return 200 with status tags
- Unparsed fallback preserves raw HTML body for later "Needs Review" UI (Plan 04)
- Mapping resolver handles case-insensitive sender + subject_contains rules with optional per-rule service filter
- `@anthropic-ai/sdk` added to runtime dependencies (not devDeps — server needs it at runtime)

## Task Commits

1. **Task 1 RED: fixtures + failing tests** — `a0bbc39` (test)
2. **Task 1 GREEN: pipedream helpers + SDK install** — `213fd06` (feat)
3. **Task 2 GREEN: email-parser + mapping-resolver** — `e107c58` (feat)
4. **Task 3 GREEN: webhook route + integration tests** — `f1dd487` (feat)

**Plan metadata:** _(this commit)_ — docs: complete plan

## Files Created/Modified

**Created**
- `server/lib/pipedream.js` — 5 pure helpers, null-safe, extractDate always returns ISO
- `server/services/email-parser.js` — parseServiceReceipt (Claude Haiku 4.5), null-on-failure contract
- `server/services/mapping-resolver.js` — resolveProjectKey with case-insensitive match + service filter
- `server/routes/webhooks-email.js` — POST handler, async/await, never-bounce, sync DB transaction after async parse
- `server/__tests__/email-pipedream.test.js` — 33 unit tests (helpers, resolver, parser smoke)
- `server/__tests__/email-webhook.test.js` — 6 integration tests
- 4 fixture payloads under `server/__tests__/fixtures/emails/`

**Modified**
- `server/index.js` — mounted `app.use("/api/webhooks/email", webhooksEmailRouter)`
- `package.json` / `package-lock.json` — added `@anthropic-ai/sdk` to dependencies

## Decisions Made

See `key-decisions` in frontmatter. Highlights:
- Whole-module require enables test monkey-patching of `parserModule.parseServiceReceipt`
- Async parser awaits outside the better-sqlite3 transaction (txns are sync-only)
- Parser smoke test runs against live Haiku when `ANTHROPIC_API_KEY` is set, skips otherwise
- extractDate normalizes RFC 2822 headers (checked_at is strict ISO)

## Deviations from Plan

None — plan executed exactly as written. Task 1 RED commit included the resolver + parser test skeletons that Task 2 filled in (combined because all tests live in a single file per plan spec).

One trivial observation: at execution time, Plan 02's parallel-wave agent had also mounted `/api/services/rules` and `/api/app-settings` in `server/index.js`. My edits preserved those mounts and inserted `/api/webhooks/email` alongside them.

## Issues Encountered

- **Pre-existing full-suite hang** — `npm run test:server` hangs on `autopilotManager.test.js` (same hang documented in 45-01's deferred-items.md). Phase 45 P03 target files (`email-pipedream.test.js` + `email-webhook.test.js`) pass 39/39 when run directly. Not touched — out of scope per execution rules.

## Deferred Issues

None new. Pre-existing hang remains in `.planning/phases/45-services-cost-tracking-foundation/deferred-items.md`.

## User Setup Required

- **Pipedream workflow** — user must create a Pipedream "Inbound Email → HTTP" workflow that POSTs `trigger.event` JSON to `https://<dashboard-url>/api/webhooks/email`. The dashboard must be reachable from Pipedream (Railway public URL or Cloudflare tunnel).
- **ANTHROPIC_API_KEY** — already set in the environment (smoke test confirmed). Must stay set in Railway env vars for Haiku parser to work in production.
- **Mapping rules** — none required for Plan 03 alone; Plan 04 adds the UI. Rows without matching rules land in `project_key=NULL` (Unassigned bucket on the Services page).

## Next Phase Readiness

- Plan 04 (UI) can now read `external_service_costs` rows filtered by `source IN ('email','unparsed')` and render a "Recent ingestions" / "Needs Review" section
- Plan 02's `/api/services/costs` route (already landed per parallel wave) surfaces Plan 03's inserted rows for the current calendar month
- Phase 46 (API integrations) will reuse the same insert-row pattern with `source='api'`

## Self-Check

- [x] `server/lib/pipedream.js` — FOUND
- [x] `server/services/email-parser.js` — FOUND
- [x] `server/services/mapping-resolver.js` — FOUND
- [x] `server/routes/webhooks-email.js` — FOUND
- [x] `server/__tests__/email-pipedream.test.js` — FOUND
- [x] `server/__tests__/email-webhook.test.js` — FOUND
- [x] 4 fixture payloads — FOUND
- [x] Commit a0bbc39 — (test: RED fixtures + failing tests)
- [x] Commit 213fd06 — (feat: pipedream helpers + @anthropic-ai/sdk)
- [x] Commit e107c58 — (feat: email-parser + mapping-resolver)
- [x] Commit f1dd487 — (feat: webhook route + integration tests)
- [x] 39/39 tests pass for Phase 45 P03 target files (33 pipedream + 6 webhook)
- [x] `server/index.js` mounts `/api/webhooks/email`
- [x] `@anthropic-ai/sdk` listed in `package.json` dependencies

## Self-Check: PASSED

---
*Phase: 45-services-cost-tracking-foundation*
*Plan: 03*
*Completed: 2026-04-11*
