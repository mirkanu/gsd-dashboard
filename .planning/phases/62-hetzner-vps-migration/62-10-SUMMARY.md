---
phase: 62-hetzner-vps-migration
plan: 10
subsystem: infra
tags: [railway, teardown, tunnel, cloudflare, vps, migration]

requires:
  - phase: 62-09b
    provides: "Claude CLI + GSD workspace migrated to VPS; parallel run validated; user sign-off received"

provides:
  - "62-TEARDOWN-LOG.md documenting all Railway services to pause/delete with step-by-step instructions"
  - "tunnel.sh cleaned up — Railway sync functions removed; GSD_DATA_URL fixed at dashboard.gsdlabs.dev"
  - "GSD_DATA_URL=https://dashboard.gsdlabs.dev set in gsddashboard/.env"
  - "PM2 gsd-tunnel restarted cleanly with updated tunnel.sh"

affects: []

tech-stack:
  added: []
  patterns:
    - "tunnel.sh no longer syncs GSD_DATA_URL to Railway — URL is now a fixed gsdlabs.dev subdomain"
    - "GSD_DATA_URL fixed value pattern: set in .env, no dynamic update needed"

key-files:
  created:
    - ".planning/phases/62-hetzner-vps-migration/62-TEARDOWN-LOG.md"
  modified:
    - "scripts/tunnel.sh (Railway sync functions removed)"
    - ".env (GSD_DATA_URL=https://dashboard.gsdlabs.dev added)"

key-decisions:
  - "Railway CLI not available on VPS — teardown log created as user-facing checklist for manual completion via railway.app dashboard"
  - "tunnel.sh update_railway() and deploy_railway() removed — GSD_DATA_URL is now a fixed subdomain, not a dynamic tunnel URL"
  - "GSD_DATA_URL added to .env as fixed value — ensures PM2 environment reflects the canonical dashboard URL"

requirements-completed: []

duration: 10min
completed: 2026-05-07
---

# Phase 62 Plan 10: Railway Teardown + tunnel.sh Cleanup — Summary

**Railway teardown log created (user action required); tunnel.sh cleaned of Railway sync; GSD_DATA_URL fixed at https://dashboard.gsdlabs.dev; PM2 gsd-tunnel restarted cleanly**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-07T15:06:48Z
- **Completed:** 2026-05-07T15:10:00Z
- **Tasks:** 2/3 auto-complete; Task 3 is a blocking human-verify checkpoint
- **Files modified:** 2 files committed + 1 .env change

## Accomplishments

### Task 1: Railway Teardown Log

Created `.planning/phases/62-hetzner-vps-migration/62-TEARDOWN-LOG.md` — a structured checklist
documenting all 7 Railway teardown actions the user must complete via the railway.app dashboard:

1. Delete Josie/n8n project
2. Delete Reforma PostgreSQL service
3. Pause or delete GSD Dashboard service
4. Pause Debates deployment (project retained per D-05)
5. Delete Ynab app + PostgreSQL
6. Delete KidAI admin + image-search-mcp + PostgreSQL
7. Cancel Railway compute subscription (~$127/month)

The log includes step-by-step dashboard navigation instructions, VPS health check commands
to run after teardown, and a post-teardown security action (revoke RAILWAY_API_TOKEN).

**Commit:** `a3e2298` — docs(62-10): create Railway teardown log

### Task 2: tunnel.sh Cleanup

Replaced the old tunnel.sh (which had Railway sync dead-code comments referencing `update_railway()`
and `deploy_railway()`) with the cleaned-up version:

- Removed all Railway function references
- Updated the log message to state "Railway sync disabled — GSD_DATA_URL is fixed at dashboard.gsdlabs.dev"
- Added `GSD_DATA_URL=https://dashboard.gsdlabs.dev` to `/home/services/gsddashboard/.env`
- Restarted PM2 `gsd-tunnel` — confirmed online within 5s
- Verified `https://dashboard.gsdlabs.dev/api/health` returns HTTP 200

**Commit:** `e70929b` — feat(62-10): remove Railway sync from tunnel.sh

## Verification Results

| Check | Result |
|-------|--------|
| `grep -c "update_railway\|deploy_railway" scripts/tunnel.sh` | 0 ✓ |
| `grep "GSD_DATA_URL" scripts/tunnel.sh` | "fixed at dashboard.gsdlabs.dev" ✓ |
| `grep "GSD_DATA_URL" .env` | `GSD_DATA_URL=https://dashboard.gsdlabs.dev` ✓ |
| `pm2 list \| grep gsd-tunnel` | online ✓ |
| `curl -f https://dashboard.gsdlabs.dev/api/health` | HTTP 200 `{"status":"ok"}` ✓ |

## Checkpoint (Task 3 — Awaiting User)

**BLOCKING:** User must complete Railway teardown via railway.app dashboard and confirm:

1. All Railway services listed in 62-TEARDOWN-LOG.md are paused or deleted
2. Railway billing estimate shows near $0 for next month
3. All gsdlabs.dev subdomains still respond after teardown

After user confirmation, Phase 62 is complete. Monthly cost drops from ~$127 to ~$8 (Hetzner CAX21 only).

## Deviations from Plan

### Auto-adjusted

**1. [Critical context] Railway CLI unavailable — teardown log converted to user checklist**
- **Found during:** Task 1 execution
- **Issue:** The plan specified `railway link` and `railway service remove` commands, but Railway CLI is not available on the VPS
- **Fix:** Created 62-TEARDOWN-LOG.md as a structured checklist with step-by-step railway.app dashboard instructions, rather than automated CLI teardown
- **Impact:** None — user was always required to verify the teardown at the checkpoint; this just makes the instructions explicit
- **Commit:** a3e2298

**2. [Rule 2] GSD_DATA_URL was not set as explicit value in .env**
- **Found during:** Task 2 (.env inspection)
- **Issue:** `.env` had only comments about GSD_DATA_URL but no explicit assignment; comments referenced old Railway sync behavior
- **Fix:** Added `GSD_DATA_URL=https://dashboard.gsdlabs.dev` as an explicit value
- **Impact:** Ensures PM2 environment reflects the canonical URL when restarted with `--update-env`

## Threat Mitigations

| Threat | Status |
|--------|--------|
| T-62-34: tunnel.sh restart interrupts Cloudflare tunnel | Mitigated — PM2 restarted within 5s; tunnel reconnected; health check passed |
| T-62-35: RAILWAY_API_TOKEN no longer needed | Documented in teardown log — user must revoke after completing teardown |

## Known Stubs

- **62-TEARDOWN-LOG.md status column:** All 7 rows show "pending" — user must update these after completing teardown via railway.app dashboard. The log is intentionally a template for user action.

## Self-Check: PASSED

- [x] `.planning/phases/62-hetzner-vps-migration/62-TEARDOWN-LOG.md` — created, commit a3e2298
- [x] `scripts/tunnel.sh` — Railway references removed, commit e70929b
- [x] `.env` — GSD_DATA_URL=https://dashboard.gsdlabs.dev present
- [x] PM2 gsd-tunnel — online after restart
- [x] `https://dashboard.gsdlabs.dev/api/health` — HTTP 200

---
*Phase: 62-hetzner-vps-migration*
*Status: Checkpoint reached — awaiting user Railway teardown confirmation*
*Completed: 2026-05-07*
