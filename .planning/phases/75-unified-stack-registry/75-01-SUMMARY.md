---
plan: 75-01
phase: 75-unified-stack-registry
status: complete
self_check: PASSED
---

# Plan 75-01: stackRegistry.js + Test Scaffolds

## What was built

**stackRegistry.js** — canonical 9-service SERVICES array with full D-01 entry shape. Covers 4 infrastructure services (betterstack, r2, umami, sentry — all with `gateTriggeredAt: 'beta->launched'`) and 5 functional services (resend, postgres, github, cloudflare-tunnel, pipedream — all with `gateTriggeredAt: null`). Includes discovery-pass comment block documenting 3 unformalised service patterns.

**stack-registry.test.js** — 5 tests covering REG-01 through REG-05 (service names, entry shape, infrastructure gate presence, functional gate null, exactly 4 infra services). All GREEN.

**claude-md-inject.test.js** — 3 todo-stubbed tests (INJECT-01/02/03) for the Plan 03 `claudeMdInjector.js` implementation.

**provisioning.test.js extended** — new `sentryProvisioner`, `umamiProvisioner`, and `validateGates with sentry + umami` describe blocks (PROV-01 through PROV-06, GATE-01/02). Correctly RED — provisioners don't exist yet.

## Discovery checkpoint findings

- 9-service baseline confirmed correct; no additions needed.
- Non-registry services (Vercel, B2, Telegram, Anthropic, Zoho, etc.) are either project-specific or external hosting — not GSD-managed.
- **Pre-existing gap fixed:** Added `CLOUDFLARE_ACCOUNT_ID=04bc84539b1073de92780f3c7568d273` to `.env.production` — r2Provisioner.js required it but it was absent.

## Self-Check

- [x] stackRegistry.js exists, loads with 9 services
- [x] 4 infrastructure / 5 functional split correct
- [x] 4 `gateTriggeredAt: 'beta->launched'` lines
- [x] Discovery comment block present
- [x] stack-registry.test.js: 5 tests GREEN (`node --test server/__tests__/stack-registry.test.js`)
- [x] claude-md-inject.test.js: exists with 3 todo stubs
- [x] provisioning.test.js: existing tests still GREEN; new blocks RED (correct TDD state)
- [x] PROV-01 through PROV-06 count: 6 ✓
- [x] GATE-01, GATE-02 count: 2 ✓
- [x] INJECT-01/02/03 count: 3 ✓

## Key files

- `server/gsd/provisioning/stackRegistry.js` (created)
- `server/__tests__/stack-registry.test.js` (created)
- `server/__tests__/claude-md-inject.test.js` (created)
- `server/__tests__/provisioning.test.js` (extended)
