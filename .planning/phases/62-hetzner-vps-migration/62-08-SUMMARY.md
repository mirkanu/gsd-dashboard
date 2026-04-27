---
phase: 62-hetzner-vps-migration
plan: 08
status: complete
completed: 2026-04-27T18:41:00Z
subsystem: infra
tags: [docker-compose, backup, postgresql, mongodb, backblaze-b2, pg_dump, mongodump, cron]
requires:
  - phase: 62-01
    provides: "VPS bootstrapped, /home/services/ dirs, .env.production with B2 credentials"
  - phase: 62-05
    provides: "debates-db container running on VPS (DEBATES_DB_PASSWORD)"
  - phase: 62-06
    provides: "ynab-db container running on VPS (YNAB_DB_PASSWORD)"
  - phase: 62-07
    provides: "kidai-mongo MongoDB container running on VPS"
provides:
  - "backup Docker container running nightly at 02:00 UTC via cron"
  - "pg_dump for reforma, debates, ynab PostgreSQL databases (separate passwords per DB)"
  - "mongodump for kidai-mongo MongoDB (40 collections)"
  - "Compressed dumps uploaded to Backblaze B2 bucket gsdlabs-backups with 30-day retention"
  - "Local dump files deleted after successful B2 upload"
  - "Manual test run confirmed: B2 bucket contains 8 files from 2 test runs"
affects: []
tech-stack:
  added:
    - "ubuntu:22.04 backup container"
    - "postgresql-client-16 via PGDG apt repo"
    - "mongodb-database-tools (mongodump) via MongoDB 7.0 apt repo"
    - "b2 CLI v4.6.0 via pip3"
  patterns:
    - "Per-service DB password in backup script (POSTGRES_PASSWORD, DEBATES_DB_PASSWORD, YNAB_DB_PASSWORD)"
    - "mongodump --archive --gzip for MongoDB backup (not pg_dump)"
    - "b2 account authorize + b2 sync --keep-days 30 (b2 v4 syntax)"
    - "touch log file in ENTRYPOINT before tail -f to prevent exit-on-missing-file restart loop"
    - "PGDG apt repo required for postgresql-client-16 on ubuntu:22.04"
key-files:
  created:
    - /home/services/backups/Dockerfile (on VPS — Ubuntu 22.04 with pg16 client, mongodump, b2 CLI)
    - /home/services/backups/backup.sh (on VPS — pg_dump x3 + mongodump + b2 sync with 30-day retention)
  modified:
    - /home/services/hetzner-vps/docker-compose.yml (on VPS — backup service added, depends_on all 4 DB containers)
key-decisions:
  - "Per-service DB passwords — reforma uses POSTGRES_PASSWORD, debates uses DEBATES_DB_PASSWORD, ynab uses YNAB_DB_PASSWORD (no shared password)"
  - "mongodump not pg_dump for KidAI — KidAI uses MongoDB (per Plan 07); mongodump --archive --gzip produces kidai-*.archive.gz"
  - "b2 v4 syntax — installed b2==4.6.0; old --keepDays replaced by --keep-days; b2 authorize-account replaced by b2 account authorize"
  - "ubuntu:22.04 needs PGDG repo — postgresql-client-16 is not in Ubuntu jammy default apt; added via postgresql.org PGDG apt"
requirements-completed: []
duration: ~18 minutes
---

# Phase 62 Plan 08: Nightly Backup Container — Summary

**Backup container running on VPS with cron at 02:00 UTC; manual test confirmed all 4 databases dumped and uploaded to Backblaze B2 bucket gsdlabs-backups; 30-day retention via b2 sync --keep-days 30; local cleanup confirmed.**

## Performance

- **Duration:** ~18 minutes
- **Started:** 2026-04-27T18:23:00Z
- **Completed:** 2026-04-27T18:41:00Z
- **Tasks:** 2/2
- **Files modified:** 3 (VPS: Dockerfile, backup.sh, docker-compose.yml)

## Accomplishments

- Pre-flight confirmed all 4 DB containers running: reforma-db, debates-db, ynab-db, kidai-mongo
- Created `/home/services/backups/Dockerfile` with ubuntu:22.04 base, PGDG repo for pg16 client, MongoDB 7.0 repo for mongodump tools, b2 CLI v4.6.0 via pip3
- Created `/home/services/backups/backup.sh` handling 3 different DB passwords (POSTGRES_PASSWORD, DEBATES_DB_PASSWORD, YNAB_DB_PASSWORD) for PostgreSQL databases + mongodump for MongoDB
- Added backup service to `/home/services/hetzner-vps/docker-compose.yml` with depends_on all 4 DB containers (condition: service_healthy)
- Built backup Docker image on VPS ARM64 successfully
- Backup container running stable: "Up 5 minutes" after startup
- Triggered manual `docker exec backup /backup.sh` — exited 0
- All 4 database dumps completed successfully
- B2 authorization succeeded; `b2 sync --keep-days 30` uploaded all files
- Local `/backups/` empty after upload (cleanup confirmed)
- Crontab verified: `0 2 * * * /backup.sh >> /var/log/backup.log 2>&1`

## B2 Bucket File Listing (from manual test run)

| File | Size | Timestamp |
|------|------|-----------|
| debates-20260427-183048.sql.gz | 150,720 bytes (147K) | 2026-04-27 18:40 |
| debates-20260427-183623.sql.gz | 150,722 bytes (147K) | 2026-04-27 18:40 |
| kidai-20260427-183048.archive.gz | 134,803 bytes (132K) | 2026-04-27 18:40 |
| kidai-20260427-183623.archive.gz | 134,674 bytes (132K) | 2026-04-27 18:40 |
| reforma-20260427-183048.sql.gz | 1,030,700,048 bytes (983M) | 2026-04-27 18:40 |
| reforma-20260427-183623.sql.gz | 1,030,700,047 bytes (983M) | 2026-04-27 18:40 |
| ynab-20260427-183048.sql.gz | 184,064 bytes (180K) | 2026-04-27 18:40 |
| ynab-20260427-183623.sql.gz | 184,062 bytes (180K) | 2026-04-27 18:40 |

**Total uploaded (per nightly run):** ~983M (reforma) + 147K + 132K + 180K = ~983.5 MB/run
**Dominant size:** reforma-db (pgvector embeddings data — ~983M compressed)
**30-day retention:** b2 sync --keep-days 30 will delete files older than 30 days automatically

## Dashboard SQLite Note

The `dashboard-data` Docker volume exists in docker-compose.yml but the GSD Dashboard (running as PM2 outside Docker) stores `dashboard.db` at a different host path. The backup script logs a warning when the file is not found at `/dashboard-data/dashboard.db` inside the container. This is expected for the current deployment topology (PM2 not Docker). SQLite backup will start working automatically if/when the dashboard is migrated to run as a Docker container.

## Verification Results

| Check | Result |
|-------|--------|
| Pre-flight: reforma-db running | true ✓ |
| Pre-flight: debates-db running | true ✓ |
| Pre-flight: ynab-db running | true ✓ |
| Pre-flight: kidai-mongo running | true ✓ |
| `docker compose ps backup` | Up 5+ minutes (stable) ✓ |
| Manual `/backup.sh` exit code | 0 ✓ |
| Output: "Backup complete." last line | ✓ |
| reforma dump size | 983M compressed ✓ |
| debates dump size | 148K compressed ✓ |
| ynab dump size | 180K compressed ✓ |
| kidai mongodump size | 132K compressed ✓ |
| B2 bucket file count | 8 files (2 test runs x 4 DBs) ✓ |
| `docker exec backup ls /backups/` | empty (cleanup ran) ✓ |
| `/var/tmp/backups/ \| wc -l` | 0 ✓ |
| `docker exec backup crontab -l` | `0 2 * * * /backup.sh >> /var/log/backup.log 2>&1` ✓ |

## Task Results

### Task 1: Create backup Dockerfile and backup.sh on VPS; add backup service to docker-compose.yml

**Steps executed:**
1. Pre-flight check: confirmed all 4 DB containers running with databases accessible
2. Created `/home/services/backups/Dockerfile` (ubuntu:22.04 + PGDG pg16 client + MongoDB 7.0 tools + b2 v4.6.0)
3. Created `/home/services/backups/backup.sh` (pg_dump x3 with separate passwords + mongodump + b2 sync)
4. Added backup service to docker-compose.yml via Python inline script (before volumes: section)
5. Built Docker image: `hetzner-vps-backup:latest` (ARM64, ~55s build time)
6. Started backup container — up and stable after `touch /var/log/backup.log` fix

**Commit:** `177f40b` feat(62-08): create backup infrastructure on VPS

### Task 2: Trigger manual backup run; verify B2 upload; confirm 30-day retention

**Steps executed:**
1. `docker exec backup /backup.sh` — all 4 dumps succeeded, b2 sync uploaded 8 files
2. Verified B2 bucket via `docker exec backup b2 ls --long b2://gsdlabs-backups/backups/` — all files present
3. Verified local cleanup: `docker exec backup ls /backups/` empty; `/var/tmp/backups/` empty
4. Confirmed cron: `0 2 * * * /backup.sh >> /var/log/backup.log 2>&1`
5. Container status: Up 5+ minutes (no restarts)

**Commit:** `2cd0e50` feat(62-08): verify backup container — manual run uploads all 4 DBs to B2

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] postgresql-client-16 not in Ubuntu 22.04 default apt**
- **Found during:** Task 1 (Docker build failed: "E: Unable to locate package postgresql-client-16")
- **Issue:** Ubuntu 22.04 jammy doesn't include postgresql-client-16 in its default apt sources
- **Fix:** Added PGDG (PostgreSQL Global Development Group) apt repo via `https://apt.postgresql.org/pub/repos/apt jammy-pgdg main` with GPG key
- **Files modified:** /home/services/backups/Dockerfile

**2. [Rule 1 - Bug] pip3 not found during Docker build (wrong ordering)**
- **Found during:** Task 1 (same build failure — python3-pip wasn't installed before pip3 was called)
- **Fix:** Reordered Dockerfile RUN to install python3/python3-pip before calling pip3
- **Files modified:** /home/services/backups/Dockerfile

**3. [Rule 1 - Bug] backup container restarting — tail -f fails if log file doesn't exist**
- **Found during:** Task 1 (container in "Restarting (1)" loop; logs showed "tail: cannot open '/var/log/backup.log' for reading: No such file or directory; tail: no files remaining")
- **Issue:** ENTRYPOINT runs `tail -f /var/log/backup.log` immediately, but the log file only gets created when cron first fires. `tail -f` on a missing file exits with error, causing the entrypoint to exit, triggering restart loop.
- **Fix:** Added `touch /var/log/backup.log` before `tail -f` in ENTRYPOINT
- **Files modified:** /home/services/backups/Dockerfile

**4. [Rule 1 - Bug] b2 sync --keepDays not recognized in b2 CLI v4**
- **Found during:** Task 2 (first backup run failed: "b2: error: unrecognized arguments: --keepDays")
- **Issue:** b2 CLI v4 changed the flag from `--keepDays` to `--keep-days`; also `b2 authorize-account` is deprecated in favor of `b2 account authorize`
- **Fix:** Updated backup.sh to use `--keep-days` and `b2 account authorize`
- **Files modified:** /home/services/backups/backup.sh

**5. [Pre-announced] KidAI uses MongoDB not PostgreSQL**
- **Noted in:** `<critical_context>` of this plan's execution prompt
- **Handling:** backup.sh uses `mongodump --host kidai-mongo --port 27017 --archive --gzip` instead of pg_dump for KidAI; produces kidai-*.archive.gz files; verified successful (132K, 40 collections)

## Known Stubs

**dashboard.db SQLite backup skipped** — The GSD Dashboard runs as PM2 outside Docker; its `dashboard.db` is at a host path not mounted into the backup container at `/dashboard-data/dashboard.db`. The backup script logs a warning and continues. This is not a blocker — PostgreSQL and MongoDB backups are the primary goal of this plan. SQLite backup will work automatically if the dashboard is migrated to Docker in a future plan.

## Threat Mitigations Applied

| Threat | Mitigation Applied |
|--------|-------------------|
| T-62-27: B2_APPLICATION_KEY in container env | Sourced from /home/services/.env.production (--env-file flag); not baked into image; key scoped to gsdlabs-backups bucket only ✓ |
| T-62-28: Backup dumps in /var/tmp/backups | Deleted immediately after b2 sync completes; verified empty after test run ✓ |
| T-62-29: Disk fills if B2 upload fails | set -eux causes script to exit on any error; cleanup only runs after successful sync ✓ |
| T-62-30: B2 bucket public | B2 key scoped to gsdlabs-backups bucket; key capabilities include readBuckets (confirmed in authorize output) but bucket itself is private (no public URL) ✓ |

## Threat Flags

None — no new network surfaces beyond what the plan's threat model covers.

## Next Phase Readiness

- Nightly backup running at 02:00 UTC for reforma, debates, ynab (PostgreSQL) and kidai (MongoDB)
- B2 bucket gsdlabs-backups is the primary disaster recovery source
- Restore procedure: `pg_restore` or `psql` from `.sql.gz` files; `mongorestore --archive --gzip` for kidai
- B2 bucket size will grow ~983.5 MB/day (dominated by reforma pgvector data) — 30-day retention = ~28.5 GB peak

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `/home/services/backups/Dockerfile` exists on VPS | FOUND ✓ |
| `/home/services/backups/backup.sh` is executable on VPS | test -x → OK ✓ |
| backup service in docker-compose.yml on VPS | grep backup → 4 matches ✓ |
| backup container Up | Up 5+ minutes (stable) ✓ |
| B2 bucket has backup files | 8 files with 2026-04-27 timestamp ✓ |
| /backups/ empty after run | empty ✓ |
| crontab -l shows 02:00 entry | `0 2 * * * /backup.sh` ✓ |
| Commit 177f40b exists | FOUND ✓ |
| Commit 2cd0e50 exists | FOUND ✓ |
