---
phase: quick-43
plan: 43
subsystem: infrastructure
tags: [tunnel, cloudflared, railway, pm2, deployment]
dependency_graph:
  requires:
    - "PM2 gsd-tunnel app (ecosystem.config.cjs)"
    - "Railway CLI authenticated via `railway login` (not project token)"
    - "/usr/local/bin/cloudflared (Debian package 2026.3.0)"
  provides:
    - "Public HTTPS tunnel at https://<random>.trycloudflare.com fronting localhost:4820"
    - ".tunnel-url file with the current URL for ops/debugging"
    - "Automatic Railway GSD_DATA_URL sync on every tunnel (re)start"
  affects:
    - "Railway backend env var GSD_DATA_URL (dynamic)"
    - "Browser wsBase response from /api/gsd/ws-base"
tech_stack:
  added:
    - "cloudflared quick tunnel (trycloudflare.com)"
  removed:
    - "Tailscale Funnel (latency)"
    - "ngrok free tier (bandwidth cap)"
  patterns:
    - "PM2-supervised foreground process with stdout log parsing"
    - "Dynamic env-var push to Railway on URL rotation"
key_files:
  modified:
    - "scripts/tunnel.sh"
    - "scripts/tunnel-setup.sh"
    - "README.md"
    - ".gitignore"
    - ".env (untracked)"
decisions:
  - "Use Cloudflare quick tunnels (no named tunnel / no cloudflared auth) — zero-config, ~150ms latency matches ngrok baseline"
  - "Remove stale RAILWAY_TOKEN from .env so `railway variables --set` falls back to the user's `railway login` session stored in ~/.config/railway"
  - "Write URL to .tunnel-url (gitignored) for ops visibility even though GSD_DATA_URL on Railway is the source of truth for wsBase"
  - "Do NOT change server/routes/gsd.js — Railway server reads GSD_DATA_URL env var; .tunnel-url is local-only"
metrics:
  duration_minutes: 10
  completed_date: 2026-04-11
  tasks_total: 5
  tasks_completed: 5
---

# Phase quick-43 Plan 43: Switch Tunnel to Cloudflare Summary

One-liner: Replaced Tailscale Funnel (1-10s latency, 502 timeouts) with a PM2-supervised cloudflared quick tunnel (~150ms latency) whose dynamic `*.trycloudflare.com` URL is auto-synced to Railway's `GSD_DATA_URL` env var on every (re)start.

## What Shipped

- `scripts/tunnel.sh` rewritten: launches `cloudflared tunnel --url http://localhost:4820`, parses the `https://<random>.trycloudflare.com` URL from its stdout/stderr, writes it to `.tunnel-url`, and calls `railway variables --set GSD_DATA_URL=<url>` (best-effort, survives CLI failure). cloudflared runs in foreground so PM2 autorestart re-rotates URL + re-syncs Railway on crash.
- `scripts/tunnel-setup.sh` rewritten with cloudflared + `railway login` instructions.
- `.env` cleaned: `TAILSCALE_FUNNEL_URL` removed (URL is dynamic), stale `RAILWAY_TOKEN`/`RAILWAY_API_TOKEN` removed (were shadowing the user's valid `railway login` session and breaking auto-sync).
- `.gitignore` adds `.tunnel-url` and `logs/`.
- `README.md` Remote Access section rewritten.
- Tailscale funnel/serve config torn down (`tailscale serve/funnel --https=443 off`) and `tailscaled` userspace daemon killed — no longer used.
- Railway redeployed (`railway up --detach`) so the new `GSD_DATA_URL` takes effect in the running container.

## Key Metrics (end-to-end verification)

| Check                                             | Before (Tailscale)  | After (Cloudflare) |
| ------------------------------------------------- | ------------------- | ------------------ |
| Direct tunnel `/api/health`                       | 1-10s / 502 timeout | **102 ms / 200**   |
| Direct tunnel `/api/sessions`                     | 1-10s / 502 timeout | **102 ms / 200**   |
| Railway `/api/sessions` (proxied)                 | 502 timeout         | **119 ms / 200**   |
| Railway `/api/gsd/projects` (cached)              | slow                | **57 ms / 200**    |
| Railway `/api/gsd/ws-base`                        | `ts.net`            | `trycloudflare.com`|
| WebSocket upgrade through tunnel (`/ws/terminal`) | 502                 | **101 + live pty** |

Cloudflare CF-Ray seen on WS: `9eaba9759b451de3-AMS` (Amsterdam PoP) — confirms HTTP/1.1 upgrade works through Cloudflare edge, not just HTTP/2 coalescing.

## Commits

| Commit    | Subject                                              |
| --------- | ---------------------------------------------------- |
| `31e7e24` | `feat(quick-43): rewrite tunnel scripts for Tailscale Funnel` (reverted in practice by next commit) |
| `f729394` | `chore(quick-43): redeploy Railway with new GSD_DATA_URL` |
| `66365e7` | `chore(quick-43): kill zombie test + tmux processes` |
| `6b98ed3` | `feat(quick-43): swap tunnel from tailscale funnel to cloudflared` |

## Deviations from Plan

### Mid-execution pivot (Tailscale → Cloudflare)

The plan originally prescribed Tailscale Funnel. Tasks 1-4 of the Tailscale plan completed and were committed (`31e7e24`, `f729394`, `66365e7`), but latency testing against the Task 5 human-verify checkpoint found:
- 1-10 second round trips for `/api/sessions` and `/api/gsd/projects` through Tailscale Funnel
- Frequent `502` timeouts when Railway proxied to the funnel
- Root cause: Tailscale's Funnel proxy for non-tailnet traffic routes through DERP relays and terminates TLS in userspace tailscaled, adding substantial per-request overhead on a small VM

The user pivoted the plan mid-execution to Cloudflare Tunnel. Latency testing of `cloudflared tunnel --url` showed 100-170ms per proxied request, matching the previous ngrok baseline.

### Rule 1 (bug) — stale Railway token in .env

**Found during:** Tunnel auto-sync step
**Issue:** `.env` contained a stale `RAILWAY_TOKEN=93fe2cd8-...` which `tunnel.sh` was loading via `set -a; . .env; set +a`. This shadowed the user's valid `railway login` session and caused `railway variables --set` to fail with `Invalid RAILWAY_TOKEN`.
**Fix:** Removed `RAILWAY_TOKEN` and `RAILWAY_API_TOKEN` from `.env` with an explanatory comment. tunnel.sh now inherits the user's CLI login from `~/.config/railway`.
**Files modified:** `.env` (untracked)
**Commit:** N/A (`.env` is gitignored)

## Gotchas Hit

1. **cloudflared writes the URL to stderr, not stdout** — the pattern `2>&1 >log` merges them correctly but `>log 2>&1` would have silently missed it. Went with a background child + `cloudflared ... >>raw 2>&1 &` and a polling loop reading the raw log file, which is more robust than FIFO plumbing.
2. **PM2 keeps restarting while the old Tailscale script was still running** — it picked up the new script on `pm2 restart gsd-tunnel` without needing `pm2 delete` + re-add, but the first restart cycle failed because of the stale Railway token. Second restart after `.env` cleanup succeeded.
3. **Tailscale ACL nodeAttrs for funnel left in place** — harmless since tailscaled is no longer running on this machine; can be removed from the admin console later without affecting anything.
4. **.tunnel-url vs GSD_DATA_URL** — initially considered making `/api/gsd/ws-base` read `.tunnel-url` first, but that file lives on the local host, not Railway's container. Railway's server still needs `GSD_DATA_URL` env var; `.tunnel-url` is purely for ops visibility and local-mode debugging.

## Verification Evidence

```
$ curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://gsd-dashboard-production.up.railway.app/api/sessions
200 0.119212s

$ curl -sS https://gsd-dashboard-production.up.railway.app/api/gsd/ws-base
{"wsBase":"wss://corners-miami-version-stronger.trycloudflare.com"}

$ curl -i --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Sec-WebSocket-Version: 13' \
    https://corners-miami-version-stronger.trycloudflare.com/ws/terminal/gsddashboard
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
CF-Ray: 9eaba9759b451de3-AMS
(live pty output streams)
```

## Known Follow-ups

- Clean up Tailscale ACL nodeAttrs in admin console (cosmetic)
- Quick tunnels rotate their URL on every cloudflared restart — if long-term stable URL is desired, upgrade to a named cloudflared tunnel with a DNS record on a user-owned zone
- Remove unused `/tmp/tailscaled.log` and `/var/lib/tailscale/` state dirs (`sudo rm -rf` if desired)

## Self-Check: PASSED

- scripts/tunnel.sh (cloudflared) — FOUND
- scripts/tunnel-setup.sh (cloudflared) — FOUND
- README.md Remote Access (Cloudflare) — FOUND
- .gitignore includes .tunnel-url and logs/ — FOUND
- .tunnel-url contains https://corners-miami-version-stronger.trycloudflare.com — FOUND
- Commit 6b98ed3 (feat(quick-43): swap tunnel from tailscale funnel to cloudflared) — FOUND
- Railway /api/gsd/ws-base returns trycloudflare.com — FOUND
- WS upgrade returns 101 through Cloudflare — FOUND
