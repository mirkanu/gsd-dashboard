---
phase: 70-hetzner-non-root-user
plan: "03"
subsystem: infrastructure/os
tags: [hetzner, non-root, cloudflare-tunnel, pm2, github-actions, gsd.js]
dependency_graph:
  requires: [70-01, 70-02]
  provides: [non-root-scripts, non-root-workflows, dangerously-skip-permissions-always-on]
  affects: [gsd-tunnel, gsd-dashboard, github-actions-deploy]
tech_stack:
  added: []
  patterns: [non-root-pm2, always-on-dangerously-skip-permissions]
key_files:
  modified:
    - scripts/named-tunnel.sh
    - scripts/healthcheck.sh
    - server/routes/gsd.js
    - .github/workflows/deploy.yml
    - /home/services/KidAI/.github/workflows/deploy-hetzner.yml
    - /home/services/ynab/.github/workflows/deploy-hetzner.yml
    - /home/services/debates/.github/workflows/deploy-hetzner.yml
decisions:
  - "isRoot check removed — --dangerously-skip-permissions always passed, safe because process runs as claude (non-root)"
  - "KidAI push blocked by OAuth App token lacking workflow scope (gho_ prefix) — file correctly edited and committed locally, push needs PAT with workflow scope"
  - "Pre-existing test failures in app-settings-route.test.js and api.test.js confirmed unrelated to this plan's changes (state pollution and WebSocket done() misuse)"
metrics:
  duration_minutes: 12
  completed_date: "2026-05-04T23:15:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 7
---

# Phase 70 Plan 03: Fix Hardcoded Paths and Remove isRoot Workaround Summary

**One-liner:** Removed all /root/ and /data/home stale paths from scripts, eliminated isRoot UID-check workaround from gsd.js, and updated all four GitHub Actions deploy workflows from root to claude user.

## Tasks Completed

| # | Task | Status | Commit | Notes |
|---|------|--------|--------|-------|
| 1 | Fix stale paths in named-tunnel.sh and healthcheck.sh | DONE | f489fc9 | Symlink removed, gsd-tunnel restarted |
| 2 | Remove isRoot from gsd.js, run tests, restart dashboard | DONE | 19a7053 | HTTP 200 confirmed |
| 3 | Update all four GitHub Actions workflows to username: claude | DONE | a166c1c | gsddashboard/ynab/debates pushed; KidAI blocked (see deviations) |

## What Was Built

### Task 1: Script path fixes
- `scripts/named-tunnel.sh` line 20: `/root/.cloudflare-tunnel/config.yml` → `/home/claude/.cloudflare-tunnel/config.yml`
- `scripts/healthcheck.sh` line 5: `PM2="/data/home/.local/bin/pm2"` → `PM2="/usr/bin/pm2"`
- `scripts/healthcheck.sh` line 25: removed stale `|| $PM2 start /data/home/gsddashboard/ecosystem.config.cjs --only gsd-dashboard` fallback
- `/root/.cloudflare-tunnel` symlink removed
- `gsd-tunnel` restarted via PM2 (now uses correct config path)

### Task 2: Remove isRoot workaround
- Removed: `const isRoot = process.getuid && process.getuid() === 0;`
- Removed: `const claudeCmd = isRoot ? 'claude --effort medium' : 'claude --effort medium --dangerously-skip-permissions';`
- Replaced with: `const claudeCmd = 'claude --effort medium --dangerously-skip-permissions';`
- `gsd-dashboard` restarted — `/api/health` returns HTTP 200

### Task 3: Workflow username updates
All four files changed from `username: root` to `username: claude`:
- `/home/services/gsddashboard/.github/workflows/deploy.yml` — pushed
- `/home/services/ynab/.github/workflows/deploy-hetzner.yml` — pushed
- `/home/services/debates/.github/workflows/deploy-hetzner.yml` — pushed
- `/home/services/KidAI/.github/workflows/deploy-hetzner.yml` — committed locally, push blocked (see deviations)

## Verification Results

```
PASS: no /root/ in named-tunnel.sh
PASS: correct /home/claude path in named-tunnel.sh
PM2="/usr/bin/pm2"
PASS: stale ecosystem path removed
PASS: isRoot removed from gsd.js
const claudeCmd = 'claude --effort medium --dangerously-skip-permissions';
username: claude  (all 4 workflow files)
PASS: /root/.cloudflare-tunnel symlink removed
HTTP 200  (gsd-dashboard health check)
```

## Deviations from Plan

### Auth Gate: KidAI workflow push blocked by OAuth token scope

**Found during:** Task 3
**Issue:** `/home/services/KidAI` uses an OAuth App token (`gho_` prefix) which lacks `workflow` scope. GitHub refuses to push `.github/workflows/` files via OAuth Apps without explicit workflow scope.
**Impact:** The file is correctly edited and committed locally on master. Only the remote push failed.
**Resolution needed:** Re-push using a classic PAT (`ghp_`) with `workflow` scope, or via the GitHub web UI.
**Command when token is available:**
```bash
# Update KidAI remote URL with a PAT that has workflow scope, then:
git -C /home/services/KidAI push
```

### Pre-existing test failures (not caused by this plan)

`npm run test:server` exits with code 1 due to two pre-existing failures unrelated to the isRoot change:
1. `app-settings-route.test.js` tests 3 and 7: DB state pollution from prior test runs leaves extra keys (`idle_timeout_minutes`, `railway_ram_rate_monthly`) in a shared SQLite instance
2. `api.test.js`: WebSocket `done is not a function` — test lifecycle issue predating this plan

Confirmed pre-existing: `git stash` + test run showed identical failures before my change.

## Known Stubs

None — all functionality is fully wired.

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- [x] `grep "/root/" scripts/named-tunnel.sh` — no output
- [x] `grep 'PM2=' scripts/healthcheck.sh` — returns `PM2="/usr/bin/pm2"`
- [x] `grep "isRoot\|getuid" server/routes/gsd.js` — no output
- [x] All four workflow files contain `username: claude`
- [x] `curl http://localhost:4820/api/health` — HTTP 200
- [x] `/root/.cloudflare-tunnel` does not exist
- [x] Commits f489fc9, 19a7053, a166c1c exist in git log
