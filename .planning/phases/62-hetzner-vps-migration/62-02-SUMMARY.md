---
phase: 62-hetzner-vps-migration
plan: 02
status: complete
completed: 2026-04-27T09:04:00Z
subsystem: infrastructure
tags: [cloudflare-tunnel, dns, github-actions, deploy]
requires: [62-01]
provides: [cloudflare-named-tunnel, gsdlabs-dev-dns, ssh-deploy-workflow]
affects: [gsddashboard-deploy, all-gsdlabs-subdomains]
tech-stack-added: [appleboy/ssh-action@v1.0.0]
tech-stack-patterns: [cloudflare-named-tunnel-ingress-rules, pm2-managed-cloudflared]
key-files-created:
  - /root/.cloudflare-tunnel/credentials.json (on VPS)
  - /root/.cloudflare-tunnel/config.yml (on VPS)
key-files-modified:
  - /data/home/gsddashboard/.github/workflows/deploy.yml
decisions:
  - Created tunnel via Cloudflare API (no browser auth) — avoids headless SSH limitation of cloudflared tunnel login
  - Used tunnel ID (not name) in config.yml — required by cloudflared when credentials were created via API
  - CNAME records are proxied=true — Cloudflare proxy hides tunnel ID; shows Cloudflare anycast IPs to public DNS
duration: 9 minutes
tasks-completed: 2
files-changed: 1
---

# Phase 62 Plan 02: Cloudflare Tunnel + Deploy Workflow — Summary

## What Was Built

Named Cloudflare Tunnel "gsdlabs-production" running on VPS via PM2 with 5-subdomain ingress rules. GSD Dashboard GitHub Actions deploy workflow updated from Railway CLI to SSH-to-VPS pattern.

## Task Results

### Task 1: Create named Cloudflare Tunnel on VPS with gsdlabs.dev ingress rules

**Method used:** Cloudflare API (not `cloudflared tunnel login`) — avoids browser auth requirement in headless SSH environment.

**Tunnel details:**
- Tunnel name: `gsdlabs-production`
- Tunnel ID: `093489ad-5644-4b42-a6c6-32c45c244fed`
- Credentials: `/root/.cloudflare-tunnel/credentials.json` (chmod 600)
- Config: `/root/.cloudflare-tunnel/config.yml` (chmod 600)
- PM2 process: `gsd-tunnel` (status: online, 4 connections to Cloudflare Frankfurt edge)
- PM2 startup: `pm2-root.service` registered with systemd (survives reboots)

**Ingress rules configured:**

| Subdomain | Port | Status |
|-----------|------|--------|
| dashboard.gsdlabs.dev | localhost:4820 | Routing (502 until Plan 04 deploys service) |
| debates.gsdlabs.dev | localhost:3000 | Routing (502 until Plan 05) |
| ynab.gsdlabs.dev | localhost:3001 | Routing (502 until Plan 06) |
| kidai.gsdlabs.dev | localhost:3002 | Routing (502 until Plan 07) |
| api.gsdlabs.dev | localhost:5000 | Routing (502 until Plan 03) |

**DNS CNAME records created (proxied via Cloudflare):**
- `dashboard.gsdlabs.dev` -> `093489ad-5644-4b42-a6c6-32c45c244fed.cfargotunnel.com`
- `debates.gsdlabs.dev` -> `093489ad-5644-4b42-a6c6-32c45c244fed.cfargotunnel.com`
- `ynab.gsdlabs.dev` -> `093489ad-5644-4b42-a6c6-32c45c244fed.cfargotunnel.com`
- `kidai.gsdlabs.dev` -> `093489ad-5644-4b42-a6c6-32c45c244fed.cfargotunnel.com`
- `api.gsdlabs.dev` -> `093489ad-5644-4b42-a6c6-32c45c244fed.cfargotunnel.com`

All resolve to Cloudflare anycast IPs (172.67.197.235, 104.21.34.46) via public DNS — correct for proxied records.

**Tunnel connection log (from PM2 logs):**
```
INF Registered tunnel connection connIndex=0 location=fra14 protocol=quic
INF Registered tunnel connection connIndex=1 location=fra08 protocol=quic
INF Registered tunnel connection connIndex=2 location=fra03 protocol=quic
INF Registered tunnel connection connIndex=3 location=fra13 protocol=quic
```

### Task 2: Update GSD Dashboard deploy workflow to SSH-to-VPS; set GitHub repo secrets

**deploy.yml updated:**
- Old: Railway CLI (`railway up --service "GSD Dashboard"`)
- New: `appleboy/ssh-action@v1.0.0` SSH deploy to `/home/services/gsddashboard`
- Added `workflow_dispatch` for manual re-deploys
- Health check: `curl -f http://localhost:4820/api/health` post-deploy

**GitHub secrets set on manuelkuhs/gsd-dashboard:**
- `HETZNER_VPS_IP` = `37.27.212.18`
- `HETZNER_SSH_KEY` = private key (from /data/home/.env HETZNER_SSH_PRIVATE_KEY)

**Workflow test:** Push triggered GitHub Actions run — successfully connected to VPS via SSH, failed at `cd /home/services/gsddashboard` (expected: directory not cloned yet, Plan 04 will set this up).

**Commit:** `0df8b1b feat(62-02): update deploy workflow to SSH Hetzner VPS deploy`

## Verification Results

| Check | Result |
|-------|--------|
| `pm2 list \| grep gsd-tunnel` | online (5m uptime, 0 restarts) |
| `cloudflared ingress validate` | OK |
| Config has 5 gsdlabs.dev subdomains | 5 ✓ |
| credentials.json permissions | 600 ✓ |
| Tunnel connections | 4 registered (fra03, fra08, fra13, fra14) |
| dashboard.gsdlabs.dev HTTP | 502 (expected — service not deployed yet) |
| deploy.yml uses appleboy/ssh-action | ✓ |
| deploy.yml has no railway up | ✓ |
| HETZNER_VPS_IP secret | set ✓ |
| HETZNER_SSH_KEY secret | set ✓ |
| PM2 startup (systemd) | pm2-root.service enabled ✓ |
| GitHub Actions SSH connectivity | Proven (connected, ran script, failed at missing dir — expected) |

## Deviations from Plan

### Auto-solved Issues

**1. [Rule 1 - Method Change] Used Cloudflare API instead of `cloudflared tunnel login`**
- **Found during:** Task 1
- **Issue:** `cloudflared tunnel login` opens a browser URL — impractical in a headless SSH environment where we cannot open a browser interactively during automated execution
- **Fix:** Used Cloudflare REST API (`POST /accounts/{id}/cfd_tunnel`) to create the tunnel and retrieve credentials directly. Same result — named tunnel with credentials.json — without browser interaction.
- **Impact:** Credentials JSON written directly to VPS; config.yml uses tunnel ID (not tunnel name) as required by API-created tunnels
- **Files affected:** VPS only (/root/.cloudflare-tunnel/)

**2. [Rule 1 - Format] config.yml uses tunnel ID not name**
- **Found during:** Task 1 config writing
- **Issue:** When tunnel is created via API (not `cloudflared tunnel create`), the `tunnel:` field in config.yml must be the tunnel UUID, not the name
- **Fix:** Used `tunnel: 093489ad-5644-4b42-a6c6-32c45c244fed` instead of `tunnel: gsdlabs-production`
- **Impact:** None — cloudflared accepts both; ingress validate confirms OK

**3. [Rule 1 - DNS] Used Cloudflare API for DNS CNAME records instead of `cloudflared tunnel route dns`**
- **Found during:** Task 1 DNS setup
- **Issue:** `cloudflared tunnel route dns` requires an authenticated cert.pem (from `cloudflared tunnel login`), which wasn't available
- **Fix:** Used Cloudflare DNS API (`POST /zones/{zone_id}/dns_records`) to create proxied CNAME records pointing to `{tunnel-id}.cfargotunnel.com`
- **Impact:** Same end result; records are proxied (Cloudflare orange-cloud), which is correct

## Key Decisions Made

1. **Cloudflare API over cloudflared CLI** — eliminates browser dependency; fully automatable for future re-runs
2. **Proxied CNAME records** — Cloudflare acts as proxy (orange-cloud on), providing DDoS protection and hiding VPS/tunnel infrastructure from public DNS
3. **4 tunnel connections (QUIC protocol)** — cloudflared automatically maintains redundant connections to multiple Cloudflare PoPs; no configuration needed

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-62-07: credentials.json disclosure | chmod 600, never committed to git |
| T-62-08: workflow tampering | Pinned `appleboy/ssh-action@v1.0.0` (not @latest) |
| T-62-10: SSH key impersonation | Key stored as masked GitHub secret |

## Known Stubs

None — tunnel is live and routing traffic. Services behind ports will return 502 until Plans 03-07 deploy them (expected during parallel run).

## Threat Flags

None — no new network surfaces beyond what the plan's threat model covers.

## Self-Check: PASSED

- `/root/.cloudflare-tunnel/credentials.json` exists on VPS ✓
- `/root/.cloudflare-tunnel/config.yml` exists on VPS ✓
- `/data/home/gsddashboard/.github/workflows/deploy.yml` updated ✓
- Commit `0df8b1b` exists in git log ✓
- `dashboard.gsdlabs.dev` resolves via DNS (Cloudflare anycast IPs) ✓
- PM2 `gsd-tunnel` process online ✓
