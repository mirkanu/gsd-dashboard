---
phase: 45-services-cost-tracking-foundation
plan: 01
subsystem: database
tags: [sqlite, better-sqlite3, aes-256-gcm, node-crypto, migrations, encryption]

requires:
  - phase: 24-external-services
    provides: external_service_costs table (extended additively here)
  - phase: 42-configuration-ui
    provides: project_settings migration idiom reused for new tables

provides:
  - 4 new SQLite tables (app_settings, processed_emails, service_mapping_rules, manual_cost_entries)
  - 7 additive columns on external_service_costs (source, message_id, project_key, notes, currency, description, raw_body)
  - Unique partial index on external_service_costs.message_id for email dedup
  - AES-256-GCM field-level encryption helpers (encryptField / decryptField)
  - app_settings-backed getSecret / setSecret / listSecretKeys API
  - Secret-leak-proof listSecretKeys (never returns plaintext or ciphertext fields)

affects:
  - 45-02 (email webhook + services cost routes)
  - 45-03 (mapping rules + manual entry routes)
  - 45-04 (credentials panel UI)
  - 46-services-api-integrations (Railway/OpenAI/Vercel credentials consumers)

tech-stack:
  added: []  # zero new deps; node:crypto is built-in
  patterns:
    - "Field-level AES-256-GCM with SHA-256-derived master key from DASHBOARD_SECRET_KEY"
    - "Base64 storage for ciphertext/IV/auth_tag (smaller on disk than hex)"
    - "Per-column try/catch SELECT-probe idiom for additive SQLite migrations"
    - "Prepared-statement ownership split: schema in db.js, statements in the route layer that uses them"

key-files:
  created:
    - server/crypto.js
    - server/__tests__/crypto.test.js
  modified:
    - server/db.js

key-decisions:
  - "Store ciphertext/IV/auth_tag as base64 (smaller on disk than hex, still URL-safe)"
  - "source column is free-text TEXT with a doc-comment enum ('manual'|'email'|'api'|'recurring'|'unparsed') — no CHECK constraint, keeps future vendors additive without a migration"
  - "getSecret returns null (logs warning) on decrypt failure instead of throwing — callers stay defensive and don't need try/catch around every read"
  - "listSecretKeys intentionally omits value_encrypted/iv/auth_tag — the GET-credentials endpoint in Plan 04 can render a redacted list without risk of leak"
  - "Prepared statements for new tables are NOT added to db.js stmts bag — Plan 02 owns the route layer and will prepare the ones it needs"

patterns-established:
  - "Encryption pattern: SHA-256(DASHBOARD_SECRET_KEY) → 32-byte key, 12-byte random IV, AES-256-GCM, base64 encode for storage"
  - "Migration pattern: wrap each ALTER TABLE in try/catch with a SELECT-probe to stay idempotent on re-boot"

requirements-completed: [SVC-08]

duration: ~23min
completed: 2026-04-11
---

# Phase 45 Plan 01: Services Cost Tracking Foundation Summary

**Schema foundation + AES-256-GCM credential encryption helper that unblocks the Plan 02/03/04 parallel wave.**

## Performance

- **Duration:** ~23 min
- **Started:** 2026-04-11T18:20:01Z
- **Completed:** 2026-04-11T18:43:22Z
- **Tasks:** 2 (1 schema, 1 TDD crypto)
- **Files modified:** 3 (1 modified, 2 created)

## Accomplishments

- 4 new SQLite tables + 7 additive columns land idempotently on boot
- Unique partial index prevents duplicate email ingestion by Message-ID
- AES-256-GCM encryption helpers with a comprehensive 7-case unit test suite (round-trip UTF-8/emoji, tamper detection, wrong-key detection, missing-key detection, DB round-trip, missing-key null, listSecretKeys no-leak)
- Zero new npm dependencies — node:crypto is built-in

## Task Commits

1. **Task 1: Phase 45 schema migrations** — `78cc826` (feat)
2. **Task 2 RED: failing crypto tests** — `ca3ced3` (test)
3. **Task 2 GREEN: crypto helpers implementation** — `810c6f2` (feat)

**Plan metadata:** _(this commit)_ — docs: complete plan

## Files Created/Modified

- `server/db.js` — Appended Phase 45 migration block (4 tables, 7 ALTER TABLEs, 4 indexes)
- `server/crypto.js` — AES-256-GCM encryptField/decryptField, getSecret/setSecret/listSecretKeys
- `server/__tests__/crypto.test.js` — 7 unit tests covering round-trip, tamper, wrong-key, missing-key, DB round-trip, missing-key read, list-no-leak

## Decisions Made

See `key-decisions` in frontmatter. Highlights:
- base64 encoding for ciphertext parts (smaller than hex)
- free-text `source` column for future vendor additions
- defensive `getSecret` (null on failure, never throws)
- `listSecretKeys` intentionally strips all ciphertext material

## Deviations from Plan

None — plan executed exactly as written. Two minor test-count deviations (added `getSecret(missing)→null` and `listSecretKeys no-leak` cases beyond the 5 specified) are additive hardening, not scope creep.

## Issues Encountered

- **Pre-existing test failures in full server suite** — `api.test.js` (readProjectMeta version, proxy test), `autopilotManager.test.js` (plan-all broadcast + suite hang), `tmux.test.js` (STAT-02 heuristic stale-hash case). Verified pre-existing by stashing Phase 45 changes and rerunning. **Logged to** `.planning/phases/45-services-cost-tracking-foundation/deferred-items.md` **and not touched** (out of scope per execution rules). Phase 45 test targets (`crypto.test.js`) pass 7/7.

## Deferred Issues

See `deferred-items.md` in this phase directory for pre-existing failures observed during execution.

## User Setup Required

None for Plan 01 alone. `DASHBOARD_SECRET_KEY` env var is already documented and set in Railway; Plan 04 (Credentials UI) will surface the first user-visible interaction with it.

## Next Phase Readiness

- Schema is in place; Plans 02, 03, 04 can now run in parallel
- `server/crypto.js` exports are stable — route layer can import and use immediately
- `external_service_costs` additive columns preserve Phase 40 / Phase 24 consumers (all new fields nullable or defaulted)
- Prepared statements intentionally left to Plan 02 to avoid touch-contention on `db.js` in the parallel wave

## Self-Check

- [x] `server/db.js` — FOUND (modified)
- [x] `server/crypto.js` — FOUND
- [x] `server/__tests__/crypto.test.js` — FOUND
- [x] Commit 78cc826 — FOUND
- [x] Commit ca3ced3 — FOUND
- [x] Commit 810c6f2 — FOUND
- [x] All 4 new tables exist in DB (verified via SELECT)
- [x] All 7 additive columns exist on external_service_costs (verified via SELECT)
- [x] All 7 crypto unit tests pass

## Self-Check: PASSED

---
*Phase: 45-services-cost-tracking-foundation*
*Plan: 01*
*Completed: 2026-04-11*
