---
phase: quick-43
verified: 2026-04-10T00:00:00Z
status: passed
score: 10/10 must-haves verified
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase quick-43: Switch Tunnel (ngrok → Cloudflare) Verification Report

**Phase Goal:** Replace bandwidth-exhausted ngrok with a fast, working public tunnel
and clean up zombie processes. Task pivoted mid-execution from Tailscale Funnel
(too slow, 502 timeouts) to Cloudflare Tunnel (~100-170ms), documented in SUMMARY.
**Verified:** 2026-04-10
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                      | Status     | Evidence                                                                                                |
| --- | ------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| 1   | `scripts/tunnel.sh` runs cloudflared (not ngrok, not tailscale) and parses URL from stdout | VERIFIED   | Line 66: `cloudflared tunnel --url "http://localhost:$DASHBOARD_PORT" --no-autoupdate`; line 81 parses `https://[a-z0-9-]+\.trycloudflare\.com` from raw log |
| 2   | Tunnel script auto-updates Railway env var `GSD_DATA_URL` when URL changes                 | VERIFIED   | `update_railway()` at line 45-58 calls `railway variables --set "GSD_DATA_URL=$NEW_URL"` after URL is parsed (line 100) |
| 3   | README documents new Cloudflare Tunnel setup (no stale ngrok/Tailscale in active docs)     | VERIFIED   | README.md lines 71-97 describe Cloudflare Tunnel setup. Only "ngrok" mention is historical ("matching the previous ngrok baseline") — no active config references |
| 4   | PM2 `gsd-tunnel` app is online                                                             | VERIFIED   | `pm2 list`: id=1, name=gsd-tunnel, status=online, pid=7758, uptime=19m                                 |
| 5   | Live Cloudflare tunnel URL returns 200 on `/api/health`                                    | VERIFIED   | `curl https://corners-miami-version-stronger.trycloudflare.com/api/health` → `health=200 time=0.111s` |
| 6   | Railway `/api/gsd/ws-base` returns current Cloudflare URL                                  | VERIFIED   | `{"wsBase":"wss://corners-miami-version-stronger.trycloudflare.com"}` — no ngrok, no ts.net            |
| 7   | Railway `/api/sessions` no longer times out with 502 (< 500ms response)                    | VERIFIED   | `curl /api/sessions` → `sessions=200 time=0.117s` (117ms, far under 500ms)                             |
| 8   | Zombie `node --test` and stale `tmux send-keys` processes (> 24h) are gone                 | VERIFIED   | `ps -eo pid,etimes,args \| awk '$2 > 86400 && /node --test server\/__tests__/'` → empty; same for `tmux send-keys` → empty |
| 9   | Active tmux sessions (KidAI, gsddashboard, ynab) still alive                               | VERIFIED   | `tmux ls` → KidAI (attached, created Apr 7), gsddashboard (Apr 5), ynab (Apr 10) — all three present   |
| 10  | Live `gsd-dashboard` PM2 is still online                                                   | VERIFIED   | `pm2 list`: id=0, name=gsd-dashboard, status=online, pid=1870, uptime=3h                               |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact                    | Expected                                                       | Status     | Details |
| --------------------------- | -------------------------------------------------------------- | ---------- | ------- |
| `scripts/tunnel.sh`         | cloudflared launcher with URL parsing + Railway auto-sync      | VERIFIED   | 114 lines, executable, contains `cloudflared tunnel --url`, URL parser, `update_railway()`, PM2-compatible foreground-wait on line 109 |
| `README.md` Remote Access   | Cloudflare Tunnel documentation                                | VERIFIED   | Lines 71-97 describe cloudflared install, railway login, `pm2 restart gsd-tunnel`, and tunnel.sh behavior |
| `.tunnel-url`               | Contains current Cloudflare URL                                | VERIFIED   | `https://corners-miami-version-stronger.trycloudflare.com` |
| PM2 `gsd-tunnel`            | online, running new script                                     | VERIFIED   | pid=7758, uptime=19m, 5 restarts (expected from mid-execution pivot) |
| PM2 `gsd-dashboard`         | online, untouched                                              | VERIFIED   | pid=1870, uptime=3h, online                                 |

### Key Link Verification

| From                                | To                                  | Via                                   | Status | Details |
| ----------------------------------- | ----------------------------------- | ------------------------------------- | ------ | ------- |
| `scripts/tunnel.sh`                 | `localhost:4820`                    | `cloudflared tunnel --url`            | WIRED  | Line 66, uses `DASHBOARD_PORT` env |
| `scripts/tunnel.sh`                 | Railway `GSD_DATA_URL`              | `railway variables --set`             | WIRED  | Line 53, invoked post-parse at line 100 |
| Railway backend                     | Cloudflare Tunnel URL               | `GSD_DATA_URL` env var                | WIRED  | `/api/gsd/ws-base` returns trycloudflare.com host |
| Browser terminal client             | Cloudflare Tunnel (wss://)          | `/api/gsd/ws-base` → wsBase           | WIRED  | Response contains `wss://corners-miami-version-stronger.trycloudflare.com` |
| Railway `/api/sessions` proxy       | Local dashboard via Cloudflare      | HTTPS proxy w/ GSD_DATA_URL           | WIRED  | End-to-end 117ms, 200 OK (vs 502 timeout pre-pivot) |

### Requirements Coverage

| Requirement             | Source Plan | Description                                           | Status    | Evidence |
| ----------------------- | ----------- | ----------------------------------------------------- | --------- | -------- |
| QUICK-43-TUNNEL-SWAP    | 43-PLAN     | Replace ngrok with a working public tunnel           | SATISFIED | Truths 1-3, 5-7; SUMMARY documents pivot to Cloudflare after Tailscale latency issues |
| QUICK-43-ZOMBIE-CLEANUP | 43-PLAN     | Kill zombie node test / tmux processes (>24h), preserve live services | SATISFIED | Truths 8-10; no zombies remain, KidAI + gsddashboard + ynab tmux sessions alive, gsd-dashboard PM2 online |

Note: Original plan prescribed Tailscale Funnel; the task pivoted mid-execution to
Cloudflare Tunnel per user decision (documented in SUMMARY "Deviations from Plan"
section). The requirement QUICK-43-TUNNEL-SWAP is framed goal-first ("replace
ngrok with a working tunnel") and is satisfied by the Cloudflare implementation.

### Anti-Patterns Found

| File                | Line | Pattern                              | Severity | Impact |
| ------------------- | ---- | ------------------------------------ | -------- | ------ |
| `scripts/tunnel.sh` | 4, 7 | "Tailscale"/"ngrok" historical comments | Info     | Documentation/context only; explains why script was rewritten. No active references. Not a stub. |

None blocking. Script is substantive (114 lines, real logic, no TODOs, no placeholders).

### Human Verification Required

None required. User has already approved terminal functionality via browser
verification (confirmed in prompt). All automated checks pass.

### Gaps Summary

No gaps found. All 10 must-haves verified against live system state:

- Tunnel script is substantive Cloudflare implementation, not a stub
- Auto-sync to Railway is wired and working (Railway ws-base matches .tunnel-url)
- PM2 gsd-tunnel, gsd-dashboard, gsd-healthcheck all online
- Live end-to-end latency 111-117ms (far under 500ms threshold, no 502s)
- Zombie cleanup succeeded without collateral damage to active sessions
- Docs (README.md) reflect current Cloudflare setup; only historical references remain

The mid-execution pivot from Tailscale Funnel to Cloudflare Tunnel is documented
transparently in the SUMMARY ("Deviations from Plan" section) and is the correct
engineering decision given the observed latency/502 behavior of Tailscale Funnel
through Railway's proxy path.

---

_Verified: 2026-04-10_
_Verifier: Claude (gsd-verifier)_
