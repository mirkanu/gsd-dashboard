---
phase: 75
slug: unified-stack-registry
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in, Node 21) |
| **Config file** | none — invoked directly |
| **Quick run command** | `node --test --test-timeout 30000 server/__tests__/provisioning.test.js server/__tests__/stack-registry.test.js server/__tests__/claude-md-inject.test.js` |
| **Full suite command** | `npm run test:server` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test --test-timeout 30000 server/__tests__/provisioning.test.js server/__tests__/stack-registry.test.js server/__tests__/claude-md-inject.test.js`
- **After every wave merge:** Run `npm run test:server`
- **Phase gate:** `npm run test:server` all green before `/gsd-verify-work`

---

## Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| PROV-01 | sentryProvisioner.createProject() returns `{ dsn, projectSlug }` | unit | `node --test server/__tests__/provisioning.test.js` | provisioning.test.js (extend) |
| PROV-02 | sentryProvisioner.checkProject() returns false on 404 | unit | same | provisioning.test.js (extend) |
| PROV-03 | umamiProvisioner.createWebsite() returns `{ websiteId }` | unit | same | provisioning.test.js (extend) |
| PROV-04 | umamiProvisioner.checkWebsite() uses domain matching not just env var | unit | same | provisioning.test.js (extend) |
| GATE-01 | validateGates beta->launched includes sentryProject in softGates when missing | unit | `node --test server/__tests__/provisioning.test.js` | provisioning.test.js (extend) |
| GATE-02 | validateGates beta->launched includes umamiWebsite in requiresProvisioning when missing | unit | same | provisioning.test.js (extend) |
| EXEC-01 | PATCH /stage executes provisioners for items in requiresProvisioning | integration | `node --test server/__tests__/stage-transitions.test.js` | stage-transitions.test.js (extend) |
| REG-01 | stackRegistry.js exports SERVICES array with all 9 expected service names | unit | `node --test server/__tests__/stack-registry.test.js` | stack-registry.test.js (new) |
| INJECT-01 | CLAUDE.md injection creates ## Stack section with correct env var names | unit | `node --test server/__tests__/claude-md-inject.test.js` | claude-md-inject.test.js (new) |

---

## Wave 0 Test Gaps

Tests that must exist before execution begins (scaffold in Plan 01):

- [ ] `server/__tests__/stack-registry.test.js` — SERVICES array shape and 9 expected service entries
- [ ] `server/__tests__/claude-md-inject.test.js` — CLAUDE.md injection helper (stub with `t.todo()` initially)
- [ ] Extend `server/__tests__/provisioning.test.js` — add sentryProvisioner and umamiProvisioner describe blocks
- [ ] Extend `server/__tests__/stage-transitions.test.js` — add provisioning execution test (EXEC-01)

---

## GREEN Criteria (Phase Gate)

Phase 75 passes when all of the following are true:

1. `npm run test:server` exits 0 with all tests in PASS state
2. `server/gsd/provisioning/stackRegistry.js` exists and exports `SERVICES` with 9 entries (betterstack, r2, umami, sentry, resend, postgres, github, cloudflare-tunnel, pipedream)
3. `server/gsd/provisioning/sentryProvisioner.js` exists and exports `{ createProject, checkProject }`
4. `server/gsd/provisioning/umamiProvisioner.js` exists and exports `{ createWebsite, checkWebsite }`
5. `server/gsd/provisioning/stageGates/validateGates.js` contains `sentryProject` and `umamiWebsite` gate entries
6. `server/routes/gsd.js` PATCH /stage route contains provisioning execution block (grep for `provisioningMap`)
7. `server/gsd/provisioning/claudeMdInjector.js` exists and exports `injectStackSection`
8. `/home/claude/.claude/CLAUDE.md` contains `## Stack Registry Rule` section and Umami/Sentry rows in the credentials table
