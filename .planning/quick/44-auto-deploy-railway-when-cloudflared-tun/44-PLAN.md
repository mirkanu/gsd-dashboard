---
mode: quick
id: 44
title: Auto-deploy Railway when Cloudflare tunnel URL rotates
created: 2026-04-11
---

# Quick Task 44: Auto-deploy Railway when Cloudflare tunnel URL rotates

## Objective

`scripts/tunnel.sh` currently updates Railway's `GSD_DATA_URL` env var on every
tunnel (re)start via `railway variables --set`, but that only updates project
config — the running Railway container keeps the OLD value until the next
deploy. When cloudflared rotates its `*.trycloudflare.com` URL (every restart,
since quick tunnels never reuse URLs), Railway's proxy points at a dead tunnel
until someone manually runs `railway up --detach`. Automate the redeploy.

## Task 1 — Auto-deploy Railway after GSD_DATA_URL update

**Type:** auto

**Files:** `scripts/tunnel.sh`

**Action:**

- Make `update_railway()` propagate its success/failure via exit status (return
  0 on success, 1 on CLI missing or railway-variables failure).
- Add a new `deploy_railway()` helper mirroring `update_railway`'s style:
  checks `command -v railway`, runs `(cd "$ROOT" && railway up --detach ...)`,
  logs success/failure. Best-effort — never kills the tunnel on failure.
- At the call site, only invoke `deploy_railway` if `update_railway` succeeded
  (so we don't redeploy with a stale var).
- cloudflared is already running in the background when the deploy runs, so
  blocking tunnel.sh on `railway up --detach` (~2-5s upload) is fine — local
  traffic keeps flowing throughout.

**Verify:**

- `sh -n scripts/tunnel.sh` passes.
- `pm2 restart gsd-tunnel` then `tail -f logs/gsd-tunnel.log` shows:
  1. New `*.trycloudflare.com` URL,
  2. `Railway GSD_DATA_URL updated`,
  3. `Railway redeploy triggered`.
- After ~90s, `curl https://gsd-dashboard-production.up.railway.app/api/gsd/ws-base`
  returns the NEW tunnel URL (matching `.tunnel-url`).
- `curl .../api/sessions` returns 200 in <500ms (proves Railway proxies
  successfully to the new tunnel).

**Done:** Railway container serves requests through the rotated tunnel URL
without any manual `railway up` step after `pm2 restart gsd-tunnel`.

## Constraints

- Do NOT break the current working tunnel. If pm2 restart breaks the chain,
  roll back tunnel.sh to the pre-change version.
- Railway deploy failure must be logged but must NOT crash tunnel.sh —
  cloudflared stays up either way.
