---
phase: 62-hetzner-vps-migration
plan: 01
status: complete
completed: 2026-04-27T08:46:06Z
---

# Plan 01: VPS Bootstrap — Summary

## What Was Built

Hetzner CAX11 ARM VPS (Helsinki) bootstrapped with full service foundation.

## Verification Results

| Check | Result |
|-------|--------|
| Architecture | aarch64 (ARM64 confirmed) |
| Docker | 29.4.1 ✓ |
| Docker Compose | v5.1.3 ✓ |
| Node.js | v20.20.2 ✓ |
| PM2 | 6.0.14 ✓ |
| cloudflared | 2026.3.0 ✓ |
| /home/services/ dirs | all 7 created ✓ |
| .env.production perms | 600 ✓ |
| docker-compose.yml scaffold | created ✓ |
| GitHub Actions deploy key | generated + authorized ✓ |
| ufw firewall | port 22 only ✓ |
| SSH password auth | disabled ✓ |

## Key Artifacts

- **VPS IP:** 37.27.212.18 (Helsinki, Hetzner CAX11 ARM)
- **Deploy key fingerprint:** SHA256:7ce/szsjMTcRIIZA7rh/z/K69/ceXlFsQH0maVnoziU
- **POSTGRES_PASSWORD (first 4 chars):** jfle...
- **Private key stored:** /data/home/.env (HETZNER_SSH_PRIVATE_KEY)
- **B2 credentials stored:** /data/home/.env
- **All secrets on VPS:** /home/services/.env.production (chmod 600, never committed)

## Deviations from Plan

1. **CAX11 not CAX21** — CAX21 unavailable in Helsinki; CAX11 (4 vCPU, 4GB, €5.39/mo) chosen instead. Can resize to CAX21 later if needed.
2. **Ubuntu 24.04 not Debian 12** — Ubuntu was the Hetzner default; functionally equivalent for our stack.
3. **RAILWAY_API_TOKEN omitted from .env.production** — intentionally unset per gsddashboard/.env comment; tunnel.sh uses Railway CLI auth session instead.
4. **KidAI uses MongoDB, not PostgreSQL** — discovered during credential gathering. Plans 07 (KidAI migration) and 08 (backup) assume PostgreSQL but KidAI actually uses `MONGODB_URI`. These plans need revision before execution.
5. **Ynab DATABASE_URL not retrieved** — Railway CLI couldn't link ynab service (no serviceId in .railway/config.json). Will obtain from Railway console during Plan 06.

## Self-Check: PASSED
