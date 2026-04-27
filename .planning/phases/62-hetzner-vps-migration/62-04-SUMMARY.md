---
phase: 62-hetzner-vps-migration
plan: 04
subsystem: infra
tags: [pm2, gsd-dashboard, cloudflare-tunnel, github-actions, sqlite, node]

requires:
  - phase: 62-01
    provides: "VPS bootstrapped with Node.js 20, PM2 6, /home/services/ dirs, .env.production"
  - phase: 62-02
    provides: "gsd-tunnel PM2 process running; Cloudflare Tunnel routing dashboard.gsdlabs.dev → localhost:4820; HETZNER_SSH_KEY + HETZNER_VPS_IP GitHub secrets set; deploy.yml updated to SSH pattern"

provides:
  - "GSD Dashboard running on VPS via PM2 gsd-dashboard process on port 4820"
  - "dashboard.gsdlabs.dev returning HTTP 200 via Cloudflare Tunnel (cf-ray header confirmed)"
  - "gsd-healthcheck PM2 process monitoring dashboard liveness with 30s interval"
  - "GitHub Actions deploy workflow end-to-end verified (push → SSH → git fetch → pm2 restart → health check)"
  - "/home/services/gsddashboard/.env with 600 permissions, all secrets loaded"

affects: [62-05-debates, 62-10-railway-teardown, railway-gsd-dashboard-teardown]

tech-stack:
  added: []
  patterns:
    - "VPS-specific ecosystem.config.cjs overrides local cwd/paths — not committed to git to avoid conflicts with local dev setup"
    - "healthcheck.sh patched on VPS to use /usr/bin/pm2 (system path) vs local /data/home/.local/bin/pm2"
    - "GitHub Actions deploy: git fetch origin master + git checkout origin/master (detached HEAD) + npm ci --production + pm2 restart"

key-files:
  created:
    - /home/services/gsddashboard/ (on VPS — cloned from mirkanu/gsd-dashboard via PAT)
    - /home/services/gsddashboard/.env (on VPS — chmod 600, not in git)
    - /home/services/gsddashboard/ecosystem.config.cjs (on VPS — VPS-specific, not committed)
    - /home/services/gsddashboard/data/dashboard.db (on VPS — SQLite created fresh on first start)
  modified:
    - /home/services/gsddashboard/scripts/healthcheck.sh (on VPS — patched PM2 path from local to system)

key-decisions:
  - "Repo is at mirkanu/gsd-dashboard (not manuelkuhs/gsd-dashboard as plan stated) — PAT from git remote confirmed the correct URL"
  - "ecosystem.config.cjs overwritten on VPS to use /home/services/gsddashboard cwd; local version uses /data/home/gsddashboard — not committed to avoid breaking local dev"
  - "healthcheck.sh patched in place on VPS (not committed) to fix hardcoded /data/home/.local/bin/pm2 path; VPS PM2 is at /usr/bin/pm2"
  - "Fresh SQLite database on VPS (dashboard.db auto-created on startup) — parallel run; history accumulates as Claude sessions move to VPS"

patterns-established:
  - "Pattern: VPS-specific config overwrites (cwd, paths) applied as untracked files on VPS to avoid breaking local dev config in git"
  - "Pattern: GitHub Actions deploy uses git checkout origin/master (detached HEAD) + npm ci + pm2 restart — no build step needed (dist pre-committed)"

requirements-completed: []

duration: 8min
completed: 2026-04-27
---

# Phase 62 Plan 04: GSD Dashboard Deploy to VPS — Summary

**GSD Dashboard running on VPS port 4820 via PM2; dashboard.gsdlabs.dev returns HTTP 200 via Cloudflare Tunnel with cf-ray header; GitHub Actions SSH deploy workflow verified end-to-end**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-27T11:58:00Z
- **Completed:** 2026-04-27T12:07:27Z
- **Tasks:** 2/2
- **Files modified:** 3 (VPS-only: .env, ecosystem.config.cjs, healthcheck.sh patch)

## Accomplishments

- Cloned mirkanu/gsd-dashboard onto VPS at /home/services/gsddashboard/ with PAT embedded in remote URL
- Created .env with all production secrets (chmod 600); SQLite auto-initialized fresh database on first start
- Fixed healthcheck.sh PM2 path from `/data/home/.local/bin/pm2` → `/usr/bin/pm2` for VPS compatibility
- Started gsd-dashboard and gsd-healthcheck via PM2 ecosystem.config.cjs; all 3 PM2 processes online (gsd-tunnel, gsd-dashboard, gsd-healthcheck)
- dashboard.gsdlabs.dev returns HTTP 200 with `cf-ray` header — confirmed traffic routes through Cloudflare Tunnel to VPS port 4820
- GitHub Actions deploy triggered, ran successfully end-to-end: SSH → git fetch → npm ci → pm2 restart → curl health check

## Verification Results

| Check | Result |
|-------|--------|
| `curl -f http://localhost:4820/api/health` | `{"status":"ok","timestamp":"2026-04-27T12:03:28.611Z"}` ✓ |
| `curl -f https://dashboard.gsdlabs.dev/api/health` | HTTP 200, health JSON ✓ |
| `curl -I https://dashboard.gsdlabs.dev/api/health \| grep cf-ray` | `cf-ray: 9f2db11c99509fc6-AMS` ✓ |
| `pm2 list \| grep gsd-dashboard \| grep online` | online (34s uptime) ✓ |
| `pm2 list \| grep gsd-healthcheck \| grep online` | online (34s uptime) ✓ |
| `pm2 list \| grep gsd-tunnel \| grep online` | online (3h uptime) ✓ |
| `.env permissions` | 600 ✓ |
| `ecosystem.config.cjs` | exists ✓ |
| `data/` directory | exists (dashboard.db created) ✓ |
| GitHub Actions deploy (run 24993975149) | success ✓ |
| Post-deploy: deploy-test.txt on VPS | EXISTS ✓ |
| Post-deploy: dashboard still healthy | HTTP 200 ✓ |
| `nslookup dashboard.gsdlabs.dev` | Cloudflare anycast IPs (172.67.197.235, 104.21.34.46) ✓ |

## Task Results

### Task 1: Clone GSD Dashboard repo to VPS, install dependencies, configure PM2

- Cloned via `git clone https://ghp_...@github.com/mirkanu/gsd-dashboard.git` (PAT from local git remote)
- `npm ci --production` ran successfully (2 audit warnings, non-blocking)
- Ecosystem.config.cjs written with VPS-specific cwd and env_file
- healthcheck.sh patched to use /usr/bin/pm2
- PM2 started with `pm2 start ecosystem.config.cjs` + `pm2 save`
- Health endpoint responding immediately

**Note on commits:** Task 1 has no local git artifacts (all changes on VPS filesystem). The deploy test commit (0745a5c) and cleanup (7766fc9) serve as the task evidence.

### Task 2: Verify dashboard.gsdlabs.dev via Cloudflare Tunnel; test GitHub Actions end-to-end

- External health check: HTTP 200 with cf-ray header (AMS edge, confirming Cloudflare routing)
- Pushed test commit `0745a5c` → GitHub Actions run 24993975149 → success (SSH connected, git fetch, npm ci, pm2 restart, health check passed)
- Cleanup commit `7766fc9` removed deploy-test.txt
- DNS: dashboard.gsdlabs.dev resolves to Cloudflare anycast IPs (not VPS IP) — proxied CNAME confirmed
- GitHub Actions run URL: https://github.com/mirkanu/gsd-dashboard/actions/runs/24993975149

## Task Commits

1. **Task 1 (VPS setup)** — No local git artifact; VPS filesystem only. See VPS: /home/services/gsddashboard/
2. **Task 2 (deploy test)** — `0745a5c` test(62): trigger VPS deploy workflow validation
3. **Task 2 (cleanup)** — `7766fc9` chore(62): remove deploy test file

## Decisions Made

1. **Repo URL is mirkanu/gsd-dashboard** (not manuelkuhs/gsd-dashboard as plan stated) — discovered from `git remote get-url origin` on local machine. Same PAT works; just different username. No action needed.
2. **ecosystem.config.cjs not committed** — The repo has a local-dev ecosystem.config.cjs with `/data/home/gsddashboard` cwd. Overwriting it on VPS (not committed) prevents conflicting with local dev. VPS-specific config lives only on the VPS.
3. **healthcheck.sh PM2 path patched on VPS (not committed)** — Hardcoded `/data/home/.local/bin/pm2` is correct for local SSH host but breaks on VPS. Patched to `/usr/bin/pm2` in place. Not committed to avoid breaking local setup.
4. **Fresh SQLite database** — No data migration from local. VPS starts clean; history accumulates as Claude sessions move to VPS later. Railway GSD Dashboard remains active in parallel.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] healthcheck.sh used hardcoded local PM2 path**
- **Found during:** Task 1 (reviewing healthcheck.sh before starting gsd-healthcheck)
- **Issue:** `PM2="/data/home/.local/bin/pm2"` is the local SSH host path; `/usr/bin/pm2` is the VPS system path. The gsd-healthcheck process would fail to restart gsd-dashboard if needed.
- **Fix:** `sed -i` patched healthcheck.sh on VPS to use `/usr/bin/pm2`. Also patched the fallback `pm2 start` path from `/data/home/gsddashboard/ecosystem.config.cjs` to `/home/services/gsddashboard/ecosystem.config.cjs`.
- **Files modified:** `/home/services/gsddashboard/scripts/healthcheck.sh` (VPS-only, not committed)
- **Verification:** gsd-healthcheck running and healthy in PM2 list

**2. [Rule 1 - Discovery] Repo is mirkanu/gsd-dashboard not manuelkuhs/gsd-dashboard**
- **Found during:** Task 1 (git remote get-url origin)
- **Issue:** Plan referenced `manuelkuhs/gsd-dashboard` but the actual remote URL is `mirkanu/gsd-dashboard`
- **Fix:** Used correct URL for clone; no other changes needed. GitHub Actions secrets (HETZNER_VPS_IP, HETZNER_SSH_KEY) are set on the correct repo.
- **Impact:** None — clone succeeded, GitHub Actions deployed successfully

---

**Total deviations:** 2 auto-fixed (2 x Rule 1 - Bug/Discovery)
**Impact on plan:** Both fixes necessary for correct operation. No scope creep.

## Known Stubs

None — dashboard is live with real API health endpoint and SQLite initialized. UI serves pre-built client/dist from git. Empty session history is expected during parallel-run period.

## Threat Mitigations Applied

| Threat | Mitigation Applied |
|--------|-------------------|
| T-62-15: .env disclosure | chmod 600 ✓; not in git (.gitignore has .env) ✓ |
| T-62-17: PM2 crash loop | max_restarts: 10, restart_delay: 3000ms in ecosystem.config.cjs ✓ |

## Next Phase Readiness

- dashboard.gsdlabs.dev is live from VPS — parallel run active alongside Railway
- GitHub Actions SSH deploy workflow is proven end-to-end — same pattern applies for debates (Plan 05), ynab (Plan 06), etc.
- Railway GSD Dashboard remains active (no DNS change needed — dashboard.gsdlabs.dev already points to VPS, Railway had its own URL)
- **Blocker before Plan 10 (Railway teardown):** None for this service — VPS dashboard is fully operational

---
*Phase: 62-hetzner-vps-migration*
*Completed: 2026-04-27*
