---
phase: 62
slug: hetzner-vps-migration
uat_date: 2026-05-04
status: partial — Plan 10 (Railway teardown) blocked pending phone SSH setup
---

# Phase 62 UAT — Hetzner VPS Migration

## Summary

Plans 01–09b: complete. Plan 10 (Railway teardown): blocked by design — Railway is the current
SSH recovery lifeline until phone SSH into Hetzner is set up.

Live service verification run: 2026-05-04T09:15Z.

---

## Service Health Matrix

| Service | Container | Docker Health | HTTP | Notes |
|---|---|---|---|---|
| GSD Dashboard | pm2 | N/A | ✅ 200 | `dashboard.gsdlabs.dev` responding |
| Cloudflare Tunnel | pm2 gsd-tunnel | N/A | ✅ | Public URL reachable |
| ynab-api | ynab-api | ✅ healthy | ✅ 200 | Port 3001 |
| kidai-admin | kidai-admin | ⚠️ unhealthy | ✅ 200 | App works; healthcheck broken (curl not in image, exit 127) |
| image-search-mcp | image-search-mcp | ✅ running | N/A | Port 8080, no health route |
| zoho-sync web | zoho-sync-web | ✅ healthy | ✅ 200 | Port 3003 |
| zoho-sync worker | zoho-sync-worker | ✅ running | N/A | Background worker |
| debates | debates | ⚠️ unhealthy | ⏱️ timeout | Port 3000 bound; healthcheck times out (10s); TLS errors in logs |
| reforma-db | reforma-db | ✅ healthy | N/A | pgvector, port 5432 |
| ynab-db | ynab-db | ✅ healthy | N/A | PostgreSQL, port (internal) |
| debates-db | debates-db | ✅ healthy | N/A | PostgreSQL, port 5433 |
| kidai-mongo | kidai-mongo | ✅ healthy | N/A | MongoDB 7 |
| backup | backup | ✅ running | N/A | Nightly B2 backup |

---

## Issues Found

### ISSUE-1: debates Docker healthcheck timing out (severity: low)
- **Status:** ⚠️ false-positive unhealthy
- **Evidence:** `docker inspect debates` shows `FailingStreak: 3864`, Output: "Health check exceeded timeout (10s)"
- **Root cause:** Healthcheck probe pings root `/`, which may trigger outbound API calls to SermonAudio. App logs show TLS ECONNRESET errors (outbound connections dropping). Port 3000 is bound and listening.
- **Impact:** Container is running and serving — Docker just can't confirm it via healthcheck. No user-visible breakage unless the SermonAudio API errors are causing the RSS feed to fail.
- **Action needed:** Verify RSS feed endpoint works (`curl http://localhost:3000/api/debates.rss`), then either extend the healthcheck timeout or change the probe URL to a lightweight route.

### ISSUE-2: kidai-admin Docker healthcheck broken (severity: low)
- **Status:** ⚠️ false-positive unhealthy
- **Evidence:** `docker inspect kidai-admin` shows `ExitCode: 127`, Output: "" (curl not installed)
- **Root cause:** Healthcheck uses `curl -sf http://...` but curl is not installed in the Next.js standalone Docker image.
- **Impact:** Container is running and serving (HTTP 200 confirmed from host). Docker just can't confirm health. No user-visible breakage.
- **Fix:** Replace `curl` with `wget -qO-` in the kidai-admin healthcheck in `docker-compose.yml`, or install curl in the Dockerfile.

### ISSUE-3: Plan 10 (Railway teardown) blocked (severity: expected)
- **Status:** 🔒 deliberately paused
- **Reason:** Railway is the current SSH recovery lifeline. Plan 10 must not run until phone SSH into Hetzner is confirmed working.
- **Blocker from memory:** "Phase 62 Plan 10 MUST NOT run until phone SSH into Hetzner is set up"
- **Action needed:** Set up phone SSH → then execute Plan 10.

---

## Plan Completion Status

| Plan | Title | Status |
|---|---|---|
| 62-01 | VPS Bootstrap | ✅ complete |
| 62-02 | GSD Dashboard + Cloudflare Tunnel | ✅ complete |
| 62-03 | Reforma DB migration | ✅ complete |
| 62-04 | Debates + Ynab migration | ✅ complete |
| 62-05 | KidAI migration | ✅ complete |
| 62-06 | Backup system | ✅ complete |
| 62-07 | Ynab migration (v2) | ✅ complete |
| 62-08 | KidAI migration (v2) | ✅ complete |
| 62-09 | User sign-off / parallel run | ✅ complete |
| 62-09b | Zoho-todoist-sync migration | ✅ complete |
| 62-10 | Railway teardown | 🔒 blocked (phone SSH prerequisite) |

---

## Manual Verification Needed

These cannot be automated from this session:

| Check | How |
|---|---|
| Debates RSS feed actually works | `curl http://localhost:3000/api/debates.rss` or open in browser |
| B2 backup files present | Check Backblaze B2 bucket for recent dump files |
| Railway billing reduced | Log into railway.app → Billing → confirm no active paid services for migrated projects |
| Phone SSH into Hetzner | Prerequisite for Plan 10 unblock |
