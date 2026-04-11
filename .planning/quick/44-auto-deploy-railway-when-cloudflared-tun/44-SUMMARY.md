---
phase: quick-44
plan: 44
subsystem: infrastructure
tags: [tunnel, cloudflared, railway, pm2, deployment]
dependency_graph:
  requires:
    - "Quick task 43 (Cloudflare tunnel swap)"
    - "Railway CLI authenticated via `railway login`"
  provides:
    - "Automatic Railway redeploy on every cloudflared URL rotation — no manual `railway up` step"
  affects:
    - "scripts/tunnel.sh (deploy_railway helper + update_railway status propagation)"
tech_stack:
  patterns:
    - "Chained best-effort post-update action in PM2-supervised wrapper script"
key_files:
  modified:
    - "scripts/tunnel.sh"
decisions:
  - "Always redeploy after a successful GSD_DATA_URL update — cloudflared quick tunnels never reuse URLs, so diff detection is pointless"
  - "update_railway() now returns status (was always 0) so deploy_railway() only runs if the env-var push succeeded — avoids redeploying with a stale value"
  - "Best-effort deploy: log + continue on failure; tunnel stays live locally regardless"
metrics:
  duration_minutes: 5
  completed_date: 2026-04-11
  tasks_total: 1
  tasks_completed: 1
---

# Quick Task 44: Auto-deploy Railway when Cloudflare tunnel URL rotates

One-liner: `scripts/tunnel.sh` now runs `railway up --detach` after
successfully pushing a new `GSD_DATA_URL`, so Railway's running container
always proxies to the current `*.trycloudflare.com` URL without any manual
step after `pm2 restart gsd-tunnel`.

## What Shipped

- `scripts/tunnel.sh` — added `deploy_railway()` helper mirroring
  `update_railway()`'s style (checks `command -v railway`, wraps in
  `(cd "$ROOT" && railway up --detach ...)`, logs success/failure).
- `update_railway()` — now returns non-zero when the CLI is missing or the
  `railway variables --set` call fails, so `deploy_railway()` can gate on it.
- Call site — `if update_railway "$URL"; then deploy_railway; fi`. No
  redeploy if the env var push failed (avoids deploying with a stale value).

## Why

Quick task 43 shipped the ngrok → Cloudflare tunnel swap. That script called
`railway variables --set GSD_DATA_URL=<url>` on every restart, which updates
Railway's *project config* — but the *running container* keeps the old value
until the next deploy. Cloudflare quick tunnels rotate URLs on every
cloudflared restart, so after any PM2 bounce or cloudflared crash, Railway's
proxy would point at a dead tunnel until someone manually ran
`railway up --detach`. This task automates that final hop.

## Verification Evidence

```
$ pm2 restart gsd-tunnel
$ tail logs/gsd-tunnel.log
[2026-04-11T17:46:57Z] Starting cloudflared quick tunnel -> http://localhost:4820
[2026-04-11T17:47:02Z] New tunnel URL: https://neural-inflation-images-otherwise.trycloudflare.com
[2026-04-11T17:47:02Z] Wrote /data/home/gsddashboard/.tunnel-url
[2026-04-11T17:47:02Z] Updating Railway GSD_DATA_URL -> https://neural-inflation-images-otherwise.trycloudflare.com
[2026-04-11T17:47:05Z] Railway GSD_DATA_URL updated
[2026-04-11T17:47:05Z] Triggering Railway redeploy (railway up --detach) so new GSD_DATA_URL takes effect
[2026-04-11T17:47:07Z] Railway redeploy triggered

# ~90s later, deploy settled:
$ curl https://gsd-dashboard-production.up.railway.app/api/gsd/ws-base
{"wsBase":"wss://neural-inflation-images-otherwise.trycloudflare.com"}

$ curl -o /dev/null -w "%{http_code} %{time_total}s\n" \
    https://gsd-dashboard-production.up.railway.app/api/sessions
200 0.140075s
```

URL rotated (was `corners-miami-version-stronger`, now
`neural-inflation-images-otherwise`), Railway served the new URL via
`/api/gsd/ws-base`, and `/api/sessions` proxied through in 140ms — all with
zero manual intervention after `pm2 restart gsd-tunnel`.

## Tradeoffs

- **Deploy cost:** Each cloudflared restart now triggers a ~1-2 minute Railway
  deploy. Acceptable because URL rotations are rare — typically only on
  container restart or cloudflared crash — and the alternative (broken proxy
  until someone notices) is worse.
- **Upload scope:** `railway up --detach` uploads the local working directory.
  Prior deploys in this project (Phase 44, Quick 43) have done this routinely,
  so it's accepted practice.
- **Not diff-gated:** Cloudflare quick tunnels never reuse URLs across
  restarts, so checking whether the URL actually changed would always say
  "yes". Saved the code.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- scripts/tunnel.sh contains `deploy_railway` function — FOUND
- scripts/tunnel.sh call site uses `if update_railway ...; then deploy_railway; fi` — FOUND
- `sh -n scripts/tunnel.sh` passes — FOUND
- New tunnel URL `neural-inflation-images-otherwise.trycloudflare.com` in `.tunnel-url` — FOUND
- Railway `/api/gsd/ws-base` returns new URL — FOUND
- Railway `/api/sessions` returns 200 / 140ms — FOUND
- `Railway redeploy triggered` log line present — FOUND
