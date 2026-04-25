# Phase 62: Hetzner VPS Migration — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 62-hetzner-vps-migration
**Areas discussed:** Service orchestration, Auto-deploy pipeline, Migration sequencing, Database backup strategy

---

## Service Orchestration

| Option | Description | Selected |
|--------|-------------|----------|
| Docker Compose | One YAML file per service group, simple, no extra layer | ✓ |
| Coolify | Self-hosted PaaS UI, auto-deploy built-in, ~500 MB RAM overhead | |
| PM2 (bare Node) | Already in use but doesn't handle PostgreSQL/Docker cleanly | |

**User's choice:** Docker Compose
**Notes:** PM2 retained for GSD Dashboard + tunnel only (existing pattern). No Coolify — don't want the extra maintenance layer.

---

## Auto-Deploy Pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions + SSH | Push → Action SSHes VPS → git pull + rebuild. Free, auditable, matches existing pattern | ✓ |
| Manual deploy script | SSH in and run deploy yourself. No automation | |

**User's choice:** GitHub Actions + SSH
**Notes:** Pattern already exists in `debates/.github/workflows/deploy.yml` — reuse that shape.

---

## Migration Sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Parallel run then cut | Run both Railway + Hetzner for ~1 week, verify, then flip DNS | ✓ |
| Hard cutover in one session | Migrate + flip DNS immediately, delete Railway right away | |

**User's choice:** Parallel run then cut
**Notes:** ~$20 extra for one week of double-billing is acceptable for zero-risk cutover.

---

## Database Backup Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Nightly pg_dump → Backblaze B2 | Cron at 02:00 UTC, 30-day retention, ~$0/month | ✓ |
| Hetzner server snapshots | Full disk snapshot, less surgical for DB-only restore | |
| Manual only | No automation | |

**User's choice:** Nightly pg_dump → Backblaze B2
**Notes:** User will need to create a Backblaze B2 account and bucket before the backup setup step.

---

## Claude's Discretion

- Exact subdomain naming on gsdlabs.dev
- SSH keypair generation and storage
- Cloudflare Tunnel architecture (one tunnel / multiple ingress rules vs per-service tunnels)
- Docker network topology
- Hetzner OS (Debian 12)
- Whether ynab and reforma share one PostgreSQL container

## Deferred Ideas

- PostgreSQL consolidation (not worth migration effort)
- Moving CLIs to local PC (decided against — VPS is the SSH host)
- Raspberry Pi alternative (Hetzner chosen for reliability + zero upfront cost)
- Hostinger / LunaDock (Hetzner chosen)
- PRC off Vercel/Supabase (already free — no action)
