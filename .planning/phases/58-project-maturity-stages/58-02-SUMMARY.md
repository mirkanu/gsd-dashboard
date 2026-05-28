---
phase: 58-project-maturity-stages
plan: "02"
subsystem: server/provisioning
tags: [provisioning, betterstack, r2, gate-validation, eligibility, tdd]
dependency_graph:
  requires: [58-01]
  provides: [validateGates, betterStackProvisioner, r2Provisioner, eligibilityChecker]
  affects: [server/routes/gsd.js POST /stage/validate]
tech_stack:
  added: []
  patterns: [module-reference-for-monkeypatching, url-discriminated-fetch-mocks, AbortSignal.timeout]
key_files:
  created:
    - server/gsd/provisioning/betterStackProvisioner.js
    - server/gsd/provisioning/r2Provisioner.js
    - server/gsd/provisioning/stageGates/validateGates.js
    - server/gsd/provisioning/stageGates/eligibilityChecker.js
    - server/__tests__/provisioning.test.js
  modified: []
decisions:
  - "Use childProcess module reference (not destructuring) in eligibilityChecker so test monkey-patching of execFileSync works"
  - "bucketName(): lowercase before applying regex to avoid replacing uppercase letters with hyphens"
  - "validateGates test uses URL-discriminated mockFetch to return different responses for BetterStack vs R2"
metrics:
  duration_mins: 25
  completed_date: "2026-05-28"
  tasks_completed: 2
  files_changed: 5
requirements: [MAT-03, MAT-05, MAT-07]
---

# Phase 58 Plan 02: Provisioning Helpers and Gate Validation Summary

BetterStack monitor + Cloudflare R2 provisioners with async gate validation state machine for beta→launched transitions.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 (RED) | Add failing provisioning tests | 29df3aa | server/__tests__/provisioning.test.js |
| 2 (GREEN) | Implement provisioners + gate modules | 9fa8fda | betterStackProvisioner.js, r2Provisioner.js, validateGates.js, eligibilityChecker.js, provisioning.test.js (fixed) |

## What Was Built

Four new modules under `server/gsd/provisioning/`:

**betterStackProvisioner.js** — `provisionMonitor(projectName, productionUrl)` POSTs to BetterStack API and returns `{ monitorId }`. `checkMonitor(projectName)` searches by name and returns boolean (swallows errors → false). `deleteMonitor(monitorId)` DELETEs. All calls use `AbortSignal.timeout(10000)`.

**r2Provisioner.js** — `createBucket(projectName)` POSTs to Cloudflare R2 with bucket name `gsd-{name}` (lowercased, non-alphanumeric → hyphen). `checkBucket` GETs and returns `response.ok`. `deleteBucket` DELETEs. Reads credentials from `CLOUDFLARE_API_KEY`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_ACCOUNT_ID`.

**stageGates/validateGates.js** — `validateGates(project, targetStage)` implements the D-03 gate matrix:
- `beta→launched`: hard gate on `productionUrlSet`; auto-provisionable gates for `betterStackMonitor` + `r2Bucket`; soft advisory for `githubIssuesEnabled`
- `alpha→beta`: soft gate on `previewUrlSet` (never blocks, per D-04)
- All other allowed transitions: empty gates → `{ valid: true }`
- Disallowed transitions: `{ valid: false, blocked: true }`

**stageGates/eligibilityChecker.js** — `meetsNudgeCriteria(project, opts)` returns true when project has been in current stage for 14+ days AND git repo has 12+ commits. Uses `childProcess.execFileSync` (module reference, not destructured) for test patchability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed bucketName regex ordering (r2Provisioner)**
- Found during: Task 2 GREEN verification
- Issue: `gsd-${projectName}`.replace(/[^a-z0-9-]/g, '-').toLowerCase()` replaced uppercase letters before lowercasing, producing `gsd--y-roject` for `MyProject`
- Fix: Lowercased first, then applied regex: `.toLowerCase().replace(/[^a-z0-9-]/g, '-')`
- Files modified: server/gsd/provisioning/r2Provisioner.js

**2. [Rule 1 - Bug] Fixed eligibilityChecker execFileSync not patchable by tests**
- Found during: Task 2 GREEN verification (stage-nudges.test.js fail)
- Issue: `const { execFileSync } = require('child_process')` destructures on load; test monkey-patches `childProcess.execFileSync` but the local binding is already fixed
- Fix: Changed to `const childProcess = require('child_process')` and use `childProcess.execFileSync(...)` so the module reference is live
- Files modified: server/gsd/provisioning/stageGates/eligibilityChecker.js

**3. [Rule 1 - Bug] Fixed URL-discriminated mockFetch in provisioning.test.js**
- Found during: Task 2 GREEN verification (validateGates test 2 fail)
- Issue: Single `mockFetch = async () => ({ ok: true, json: async () => ({ data: [] }) })` returned `ok: true` for R2 calls too — `checkBucket` reads `response.ok` so it thought bucket existed
- Fix: URL-discriminated mock: BetterStack URLs return `{ data: [] }` (empty = not found); R2 URLs return `{ ok: false }` (404 = not found)
- Files modified: server/__tests__/provisioning.test.js

## TDD Gate Compliance

- RED commit: `29df3aa` — `test(58-02): add failing tests for provisioning helpers and gate validation`
- GREEN commit: `9fa8fda` — `feat(58-02): implement provisioning helpers and gate validation state machine`

## Test Results

```
provisioning          — PASS (9 subtests)
stage-nudges          — PASS (3 subtests, was failing pre-plan)
stage-transitions     — PASS (7 subtests)
Full suite: 360 pass, 11 fail (all 11 are pre-existing failures unrelated to this plan)
```

## Known Stubs

None. All provisioners make real API calls with real credentials from env. The validate endpoint in gsd.js was already wired to use validateGates via a try/require pattern from Plan 01.

## Threat Flags

No new surface. Threat mitigations T-58-07 through T-58-11 implemented as specified:
- Credentials never logged or returned in responses
- `execFileSync` uses array args form (no shell injection)
- `AbortSignal.timeout(10000)` on all external calls

## Self-Check

- [x] server/gsd/provisioning/betterStackProvisioner.js — FOUND
- [x] server/gsd/provisioning/r2Provisioner.js — FOUND
- [x] server/gsd/provisioning/stageGates/validateGates.js — FOUND
- [x] server/gsd/provisioning/stageGates/eligibilityChecker.js — FOUND
- [x] server/__tests__/provisioning.test.js — FOUND
- [x] RED commit 29df3aa — FOUND
- [x] GREEN commit 9fa8fda — FOUND
