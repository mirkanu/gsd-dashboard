---
phase: 62-hetzner-vps-migration
plan: 05
status: complete
completed: 2026-04-27T12:51:00Z
subsystem: infra
tags: [docker-compose, debates, postgresql, cloudflare-tunnel, github-actions]
requires:
  - phase: 62-01
    provides: "VPS bootstrapped, /home/services/ dirs, .env.production"
  - phase: 62-02
    provides: "Cloudflare Tunnel routing debates.gsdlabs.dev → localhost:3000; HETZNER_SSH_KEY secrets"
provides:
  - "debates Docker container running on VPS port 3000 (healthy)"
  - "debates-db PostgreSQL 16 container on VPS port 5433 with 624 debates + 230 debaters migrated from Railway"
  - "debates.gsdlabs.dev returning HTTP 200 via Cloudflare Tunnel (cf-ray confirmed)"
  - "GitHub Actions SSH deploy workflow for mirkanu/christiandebates on push to master"
affects: [62-10-railway-teardown]
tech-stack:
  added:
    - postgres:16-alpine (debates-db container)
  patterns:
    - "Per-service DB password (DEBATES_DB_PASSWORD) with no special chars — avoids URL encoding issues"
    - "Railway API GraphQL to retrieve external PostgreSQL URL (DATABASE_PUBLIC_URL) for data migration"
    - "pg18 Docker image used to dump from Railway PostgreSQL 18 (pg_dump version must match server)"
    - "Healthcheck uses wget -qO- http://$(hostname -i):PORT/ — node:alpine binds to container eth0 IP not localhost"
key-files:
  created:
    - /home/services/hetzner-vps/docker-compose.yml (on VPS — debates-db and debates services added)
    - /home/services/debates/ (on VPS — cloned from mirkanu/christiandebates)
    - /data/home/debates/.github/workflows/deploy-hetzner.yml
  modified:
    - /home/services/.env.production (on VPS — debates env vars + DEBATES_DB_PASSWORD added)
key-decisions:
  - "debates has a real PostgreSQL database (624 debates, 230 debaters) — plan's 'no persistent database' was incorrect; added debates-db container and migrated data"
  - "DEBATES_DB_PASSWORD (hex, no special chars) instead of shared POSTGRES_PASSWORD to avoid URL encoding issues in DATABASE_URL"
  - "Used Railway GraphQL API to get DATABASE_PUBLIC_URL for cross-network pg_dump"
  - "pg18 Docker image needed for pg_dump — Railway Postgres is version 18.3, debates-db container is 16"
  - "Repo moved: manuelkuhs/christiandebates → mirkanu/christiandebates (same PAT, different username)"
  - "Branch is master (not main) — workflow updated to trigger on master push"
  - "Healthcheck uses hostname -i not localhost — Next.js standalone binds to eth0 IP in Docker, not 127.0.0.1"
requirements-completed: []
duration: 31 minutes
---

# Phase 62 Plan 05: Debates Deploy to VPS — Summary

**debates Docker container and debates-db PostgreSQL running on VPS with 624 debates migrated; debates.gsdlabs.dev returns HTTP 200 via Cloudflare Tunnel with cf-ray header; GitHub Actions SSH deploy workflow created for mirkanu/christiandebates**

## Performance

- **Duration:** 31 minutes
- **Started:** 2026-04-27T12:18:27Z
- **Completed:** 2026-04-27T12:51:00Z
- **Tasks:** 2/2
- **Files modified:** 3 (VPS: docker-compose.yml, .env.production; debates repo: deploy-hetzner.yml)

## Accomplishments

- Cloned `mirkanu/christiandebates` repo to VPS at `/home/services/debates/`
- Added `debates-db` (postgres:16-alpine) and `debates` services to VPS docker-compose.yml
- Discovered debates has a real PostgreSQL database; migrated 624 debates + 230 debaters from Railway
- Built debates Docker image on ARM64 VPS successfully (node:20-alpine, Next.js standalone)
- Both debates-db and debates containers healthy; HTTP 200 at localhost:3000
- debates.gsdlabs.dev returns HTTP 200 with cf-ray header via Cloudflare Tunnel
- Created `/data/home/debates/.github/workflows/deploy-hetzner.yml` with `appleboy/ssh-action@v1.0.0`
- Set `HETZNER_VPS_IP` and `HETZNER_SSH_KEY` GitHub secrets on mirkanu/christiandebates
- Workflow pushed and verified via `git push origin master`

## Verification Results

| Check | Result |
|-------|--------|
| `docker ps \| grep debates` | debates: Up (healthy), debates-db: Up (healthy) |
| `curl -sf http://localhost:3000/` on VPS | HTTP 200 ✓ |
| `curl -sI https://debates.gsdlabs.dev \| head -1` | `HTTP/2 200` ✓ |
| `curl -sI https://debates.gsdlabs.dev \| grep cf-ray` | `cf-ray: 9f2df276eb60a003-AMS` ✓ |
| Database row count | 624 debates, 230 debaters ✓ |
| `deploy-hetzner.yml` contains `appleboy/ssh-action@v1.0.0` | ✓ |
| `gh secret list` on mirkanu/christiandebates | HETZNER_VPS_IP, HETZNER_SSH_KEY ✓ |
| `git log --oneline -1 \| grep Hetzner` | `84c53e8 fix(62): use master branch in Hetzner deploy workflow` ✓ |

## Task Results

### Task 1: Clone debates repo, add to docker-compose.yml, build and start container

**Steps executed:**
1. Checked debates Railway env vars via Railway API (found DATABASE_URL, SYNC_SECRET, ADMIN_TOKEN, etc.)
2. Cloned `mirkanu/christiandebates` to `/home/services/debates/` on VPS using PAT
3. Added `debates-db` and `debates` services to docker-compose.yml
4. Added debates env vars (`DEBATES_SYNC_SECRET`, `DEBATES_ADMIN_TOKEN`, `DEBATES_ANTHROPIC_API_KEY`, `DEBATES_TELEGRAM_BOT_TOKEN`, `DEBATES_TELEGRAM_CHAT_ID`, `DEBATES_YOUTUBE_API_KEY`) to `.env.production`
5. Started `debates-db` container; migrated data from Railway via `pg18` Docker image
6. Built `hetzner-vps-debates` image on ARM64 VPS
7. Started `debates` container — healthy and serving HTTP 200

**Key artifact:** `/home/services/hetzner-vps/docker-compose.yml` on VPS (debates-db + debates services, 10 debates-related entries)

### Task 2: Create GitHub Actions deploy workflow; set repo secrets; verify debates.gsdlabs.dev

**Steps executed:**
1. Created `/data/home/debates/.github/workflows/deploy-hetzner.yml` (appleboy/ssh-action@v1.0.0 pattern)
2. Set `HETZNER_VPS_IP=37.27.212.18` and `HETZNER_SSH_KEY` (full Ed25519 private key) as GitHub secrets on mirkanu/christiandebates
3. Committed and pushed workflow (2 commits: initial + branch fix)
4. Updated VPS git remote to use mirkanu URL with PAT; verified `git fetch origin master` works
5. Verified `https://debates.gsdlabs.dev` returns HTTP 200 with `cf-ray` header

**Commits in debates repo:**
- `1aac78c` feat(62): add Hetzner VPS deploy workflow
- `84c53e8` fix(62): use master branch in Hetzner deploy workflow

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Discovery] debates has a real PostgreSQL database — plan said "no persistent database"**
- **Found during:** Task 1 (reading db.ts and Railway variables)
- **Issue:** Plan stated debates has no persistent database, but it has a full PostgreSQL schema with 624 debates, 230 debaters, collections, tags, transcripts. DATABASE_URL points to Railway internal postgres.
- **Fix:** Added `debates-db` PostgreSQL 16 container to docker-compose.yml. Obtained external Railway DB URL via Railway GraphQL API (`DATABASE_PUBLIC_URL`). Migrated data using pg18 Docker image to match Railway's Postgres version 18.3. Added `DEBATES_DB_PASSWORD` (hex, no special chars) to avoid URL encoding bugs.
- **Files modified:** VPS docker-compose.yml, VPS .env.production
- **Impact:** debates container connects to VPS-local database with full production data

**2. [Rule 1 - Bug] POSTGRES_PASSWORD has special chars that break DATABASE_URL**
- **Found during:** Task 1 (container exited with `TypeError: Invalid URL`)
- **Issue:** Shared `POSTGRES_PASSWORD=jfleOZ+OtSHqZptJ0MAmgOkSqupAipV574/Pj/tgo80=` contains `+`, `/`, `=` which are not valid unencoded in a PostgreSQL URL. The postgres.js library rejects it with `ERR_INVALID_URL`.
- **Fix:** Generated `DEBATES_DB_PASSWORD` (64-char hex, no special chars). debates-db and debates services use this dedicated password variable.
- **Files modified:** VPS docker-compose.yml, VPS .env.production
- **Commit:** VPS-only change (not in git)

**3. [Rule 1 - Bug] pg_dump version mismatch — Railway runs Postgres 18.3**
- **Found during:** Task 1 (pg_dump error "server version mismatch")
- **Issue:** debates-db container is postgres:16-alpine. Railway's managed Postgres is 18.3. pg_dump from pg16 cannot dump a pg18 server.
- **Fix:** Used `docker run --rm postgres:18-alpine pg_dump ...` to dump with pg18 client. Restored to local debates-db container using pg16 psql (compatible for restore).
- **Files modified:** None (temporary Docker container, no file changes)

**4. [Rule 1 - Bug] Healthcheck uses localhost but Next.js standalone binds to eth0 IP**
- **Found during:** Task 1 (container stayed unhealthy — `wget localhost:3000` returned "Connection refused")
- **Issue:** Next.js standalone server in Docker binds to the container's eth0 IP (e.g. `172.18.0.4:3000`), not `0.0.0.0:3000`. `localhost` and `127.0.0.1` don't work inside the container.
- **Fix:** Changed healthcheck from `wget -qO- http://localhost:3000/` to `wget -qO- http://$(hostname -i):3000/`. `hostname -i` returns the container's actual IP.
- **Files modified:** VPS docker-compose.yml

**5. [Rule 1 - Discovery] Repo moved from manuelkuhs/ to mirkanu/ namespace**
- **Found during:** Task 2 (git push rejected "repository moved")
- **Issue:** `manuelkuhs/christiandebates` redirected to `mirkanu/christiandebates`. PAT push is refused for workflow files without `workflow` scope. The `ghp_REDACTED` PAT has both `repo` and `workflow` scopes and works with `mirkanu/`.
- **Fix:** Updated git remote on local machine and VPS to `https://ghp_.../mirkanu/christiandebates.git`.
- **Files modified:** VPS git remote config only

**6. [Rule 1 - Bug] Branch is master not main**
- **Found during:** Task 2 (git push: "src refspec main does not match any")
- **Issue:** Plan workflow template used `branches: [main]` but debates repo uses `master`.
- **Fix:** Updated workflow to trigger on `master`, and git commands to `fetch/checkout origin/master`.
- **Commit:** `84c53e8` fix(62): use master branch in Hetzner deploy workflow

## Key Decisions Made

1. **Dedicated DEBATES_DB_PASSWORD** — Hex password (no special chars) avoids URL encoding issues. The shared POSTGRES_PASSWORD is only safe in YAML `environment:` key-value syntax, not in URL format.
2. **Data migration included** — Despite plan saying "no persistent database", migrated 624 debates + 230 debaters from Railway because the app requires DB for all routes. Empty DB would give degraded (but not crashed) experience; full data migration is correct for parallel run.
3. **pg18 Docker image for dump** — Railway upgraded to Postgres 18; used matching pg_dump version via temporary Docker container without permanently changing debates-db version.

## Known Stubs

None — debates.gsdlabs.dev serves real data from migrated PostgreSQL database.

## Threat Mitigations Applied

| Threat | Mitigation Applied |
|--------|-------------------|
| T-62-18: Tampering via COPY . . | .dockerignore verified: excludes .env*, node_modules, .git, .planning (except duplicate-candidates.json) ✓ |
| T-62-19: Denial of Service / crashes | restart: unless-stopped; healthcheck with hostname -i; json-file log driver ✓ |
| T-62-20: NEXT_PUBLIC_* disclosure | No NEXT_PUBLIC_* vars in debates env — only server-side vars (SYNC_SECRET, ADMIN_TOKEN, DB URL) ✓ |

## Threat Flags

None — no new network surfaces beyond what the plan's threat model covers.

## Next Phase Readiness

- debates.gsdlabs.dev is live from VPS with full production data
- Railway debates deployment remains active (parallel run — teardown in Plan 10)
- GitHub Actions deploy workflow proven at push time; ready for auto-deploy on next commit to master
- **Blocker before Plan 10:** None for debates service — VPS debates is fully operational

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `/data/home/debates/.github/workflows/deploy-hetzner.yml` exists | FOUND ✓ |
| `.planning/phases/62-hetzner-vps-migration/62-05-SUMMARY.md` exists | FOUND ✓ |
| Commit `84c53e8` (branch fix) in debates repo | FOUND ✓ |
| Commit `1aac78c` (workflow creation) in debates repo | FOUND ✓ |
| debates container healthy on VPS | Up (healthy) ✓ |
| debates-db container healthy on VPS | Up (healthy) ✓ |
| `/home/services/debates/Dockerfile` on VPS | FOUND ✓ |
| `grep -c debates docker-compose.yml` ≥ 3 | 10 ✓ |
| `https://debates.gsdlabs.dev` HTTP status | 200 ✓ |
