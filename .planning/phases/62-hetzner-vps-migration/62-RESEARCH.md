# Phase 62: Hetzner VPS Migration — Research

**Researched:** 2026-04-25
**Domain:** Infrastructure provisioning, containerized deployment, DNS/tunnel configuration
**Confidence:** HIGH

## Summary

This phase consolidates five Railway services onto a single Hetzner CAX21 ARM VPS (~$8/month vs. ~$127/month on Railway). The architecture uses Docker Compose for service orchestration, GitHub Actions for auto-deploy on git push, Cloudflare Tunnel for public DNS routing through gsdlabs.dev subdomains, and automated PostgreSQL backups to Backblaze B2.

The migration follows a parallel-run strategy: all services launch on Hetzner alongside existing Railway deployments for ~1 week to validate correctness before DNS cutover and Railway cleanup. This eliminates downtime and user-facing risk.

**Primary recommendation:** Provision Hetzner VPS with Debian 12, bring up all services in Docker Compose, set up GitHub Actions SSH deploy workflows per service, validate each service on gsdlabs.dev subdomains, then flip DNS and cancel Railway.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use **Docker Compose** for all services — one `docker-compose.yml` per logical group, `docker compose up -d` to start, automatic restart-on-crash policy. No Coolify, no extra PaaS layer. PM2 is retained only for the GSD Dashboard + tunnel (already established pattern on this host).
- **D-02:** **GitHub Actions + SSH** for all services that auto-deploy. On push to `main`: Action SSHes into VPS → `git pull` + `docker compose up --build -d`. Pattern already used in `debates/.github/workflows/deploy.yml` and `ynab` — reuse that shape.
- **D-03:** Each repo gets its own deploy action scoped to its service. Shared SSH key stored as a GitHub Actions secret across relevant repos.
- **D-04:** **Parallel run, then cut.** Hetzner VPS comes up alongside Railway. All services are migrated and verified on Hetzner before any DNS is flipped. Only after the user confirms everything works does Railway get shut down. ~1 week double-billing (~$20) is acceptable for zero-risk cutover.
- **D-05:** Migration order (lowest risk first):
  1. Reforma PostgreSQL (read-heavy, Vercel calls it — easy to switch connection string)
  2. GSD Dashboard (already runs as PM2 on this host — essentially a lift-and-shift)
  3. Debates (no persistent data — just redeploy)
  4. Ynab (Next.js + PostgreSQL)
  5. KidAI admin + image-search-mcp + PostgreSQL (most complex — last)
  6. Josie: **delete** from Railway entirely (archived project, no migration needed)
- **D-06:** **Nightly pg_dump → Backblaze B2.** Cron job at 02:00 UTC dumps all databases, compresses, and uploads to a B2 bucket. Retention: 30 days. B2 cost: ~$0/month at current database sizes. This runs as a Docker container on the VPS alongside the services.
- **D-07:** Backblaze B2 credentials to be provisioned during setup (user creates B2 account and bucket; I configure the backup container).

### Claude's Discretion
- Exact subdomain naming on gsdlabs.dev (e.g. `dashboard.gsdlabs.dev`, `kidai.gsdlabs.dev`)
- SSH keypair generation and storage location on VPS
- Cloudflare Tunnel architecture (one tunnel with multiple ingress rules vs per-service tunnels)
- Docker network topology (shared bridge vs per-service networks)
- Hetzner server OS (Debian 12 recommended — stable, well-supported)
- Whether Ynab and Reforma PostgreSQL share one PostgreSQL container or run separately

### Deferred Ideas (OUT OF SCOPE)
- Consolidating multiple PostgreSQL instances into one (discussed, deemed not worth the migration effort vs savings — each service keeps its own DB container for now)
- Moving Claude CLIs to local PC instead of VPS (decided against — keeping VPS as SSH host)
- Raspberry Pi as alternative to Hetzner (discussed, Hetzner chosen for data-centre reliability and zero upfront cost)
- Hostinger / LunaDock alternatives (discussed, Hetzner chosen)
- PRC migration off Vercel/Supabase (PRC is already free on both — no action needed)
- Debates: resume is possible, but for now delete from Railway (pause == remove deployment)

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Service orchestration | Docker Compose (single VPS) | — | One-server deployment; Compose sufficient for stable multi-service stack |
| Public DNS routing | Cloudflare Tunnel (ingress rules) | — | Tunnel replaces Railway's managed public URL; subdomains via rules |
| Persistent data | PostgreSQL Docker containers | B2 backups | Each service owns its database; backups to object storage for disaster recovery |
| Auto-deploy pipeline | GitHub Actions (SSH) | — | Trigger on push to main; SSH into VPS to pull + rebuild + restart |
| GSD Dashboard hosting | PM2 (existing) | Docker (fallback) | PM2 already manages gsd-dashboard; simplifies transition; retain on VPS |
| Tunnel management | PM2 (existing) | cloudflared CLI | PM2 manages cloudflared process; reuse existing tunnel.sh script |
| Cron jobs | Docker container | crontab (fallback) | Backup cron runs inside Docker; resilient to VPS restarts |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Docker** | 24.0.7+ | Container runtime; isolates services, repeatable deploys | [VERIFIED: available on VPS] Standard in production multi-service deployments; eliminates "works on my machine" |
| **Docker Compose** | 2.24.0+ (or bundled in Docker) | Multi-container orchestration; declarative YAML config | [VERIFIED: official Docker docs] Industry standard for single-server stacks; all services in one file |
| **Node.js** | 20-alpine (base image) | JavaScript runtime for debates, ynab, KidAI, GSD Dashboard | [VERIFIED: existing Dockerfiles] Node 20 LTS; Alpine reduces image size |
| **PostgreSQL** | 16 (base image) | Relational database for Reforma, ynab, KidAI | [VERIFIED: current version in use] Latest stable; backward-compatible with existing schemas |
| **Cloudflare Tunnel** | 2026.3.0+ | Secure DNS tunnel; replaces ngrok/Tailscale | [VERIFIED: installed and running] ~100-170ms latency; no bandwidth caps; auto-rotates trycloudflare.com URL |
| **PM2** | 6.0.14 | Process manager for gsd-dashboard + cloudflared tunnel | [VERIFIED: active in pm2 list] Existing pattern on this host; restart on crash; ecosystem file for repeatability |
| **GitHub Actions** | Built-in | CI/CD automation for auto-deploy workflows | [VERIFIED: debates/.github/workflows/deploy.yml exists] Native GitHub integration; SSH key as repo secret |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Backblaze B2 CLI** | Latest | Cloud object storage for PostgreSQL backups | Backup Docker container; nightly pg_dump + compress + upload |
| **Hetzner API** | v2 | Cloud provisioning; server lifecycle + DNS | Initial VPS setup; may use for monitoring/alerts |
| **Cloudflare API** | v4 | DNS record management; tunnel status | Optional: automation for subdomain setup (manual via UI acceptable) |
| **Railway CLI** | Latest | Interact with remaining Railway services (during parallel run) | Querying env vars, triggering deploys on Railway during validation phase |
| **Debian 12** | 12.x | Server OS | [ASSUMED] ARM-based CAX21; stable, well-supported, minimal attack surface |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Docker Compose | Kubernetes | Overkill for single-server; added complexity, learning curve, cost |
| Docker Compose | Coolify / CapRover | PaaS simplicity, but less control over service config; D-01 explicitly rejects this |
| Cloudflare Tunnel | ngrok / Tailscale | ngrok: bandwidth caps, ~$5-15/month. Tailscale: 1-10s latency (tested, rejected). Cloudflare: free, low-latency, already integrated |
| PM2 | systemd | systemd is lighter; PM2 adds ~15MB memory. But PM2 ecosystem file portable to VPS, simplifies migration of existing tunnel.sh |
| PostgreSQL in Docker | Managed database (AWS RDS) | Cost: RDS ~$15-40/month per instance. Docker on Hetzner: ~$0 (included in $8 VPS). Trade-off: manual backups (D-06 handles this) |
| nightly pg_dump → B2 | WAL streaming to S3 | pg_dump is simpler, lower cost; WAL streaming ~$5-10/month in object storage + complexity. 30-day retention adequate for this phase |

**Installation (Docker):**
```bash
# On Hetzner VPS (Debian 12):
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Docker Compose comes bundled with Docker 24.0+; verify:
docker compose --version
```

**Version verification:** All versions above are current as of 2026-04-25 and cross-verified with official sources.

---

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────────────────────────────┐
                         │     GitHub (5 repos)             │
                         │  push main → GitHub Actions      │
                         └──────────────┬───────────────────┘
                                        │
                                        │ SSH deploy trigger
                                        │
                    ┌───────────────────▼──────────────────┐
                    │   Hetzner CAX21 VPS (Debian 12)      │
                    │   8 GB ARM @ €7.99/month             │
                    │                                       │
                    │  ┌─────────────────────────────────┐ │
                    │  │   Docker Compose Stack          │ │
                    │  │                                 │ │
                    │  │  • gsd-dashboard (Node.js 20)   │ │
                    │  │  • debates (Next.js + Docker)   │ │
                    │  │  • ynab (Next.js + Docker)      │ │
                    │  │  • kidai-admin (Node.js)        │ │
                    │  │  • image-search-mcp (sidecar)   │ │
                    │  │  • reforma-api (Node.js)        │ │
                    │  │                                 │ │
                    │  │  PostgreSQL containers:         │ │
                    │  │  • reforma-db                   │ │
                    │  │  • ynab-db                      │ │
                    │  │  • kidai-db                     │ │
                    │  │                                 │ │
                    │  │  PM2 processes:                 │ │
                    │  │  • gsd-dashboard (app)          │ │
                    │  │  • gsd-tunnel (cloudflared)     │ │
                    │  │  • gsd-healthcheck             │ │
                    │  └──────────┬──────────────────────┘ │
                    │             │                        │
                    │  ┌──────────▼──────────────────────┐ │
                    │  │  Backup Container (cron)        │ │
                    │  │  • 02:00 UTC: pg_dump all dbs   │ │
                    │  │  • Compress + upload to B2      │ │
                    │  │  • 30-day retention             │ │
                    │  └──────────┬──────────────────────┘ │
                    │             │                        │
                    └─────────────┼────────────────────────┘
                                  │
                    ┌─────────────▼────────────────────────┐
                    │  Cloudflare Tunnel (cloudflared)     │
                    │  gsdlabs.dev ingress rules:          │
                    │  • dashboard.gsdlabs.dev → :4820     │
                    │  • debates.gsdlabs.dev → :3000       │
                    │  • ynab.gsdlabs.dev → :3001         │
                    │  • kidai.gsdlabs.dev → :3002         │
                    │  • api.gsdlabs.dev → :5000          │
                    └─────────────┬────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────────────┐
                    │     Cloudflare DNS + Tunnel         │
                    │     (free tier, auto-rotates)       │
                    └─────────────┬──────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────────────┐
                    │     Internet + End Users            │
                    │  (parallel run: Railway still live)  │
                    └─────────────────────────────────────┘


  Backup flow:
  Docker backup container → (pg_dump each database)
                         → (gzip)
                         → (upload to Backblaze B2)
```

**Data flow:**
1. Developer pushes to `main` on GitHub
2. GitHub Actions SSH into Hetzner VPS with pre-shared key
3. Action runs: `git pull && docker compose up --build -d`
4. Docker re-builds only changed images, restarts affected services
5. Cloudflare Tunnel auto-routes requests to local container ports
6. Each service publishes on private bridge network (not exposed to VPS host network)
7. Nightly cron: backup container dumps all PostgreSQL databases, compresses, uploads to B2
8. **Parallel run:** Railway services run simultaneously; DNS points to Railway initially
9. **Cutover:** After validation, user updates DNS to point to Cloudflare Tunnel; Railway services are paused/deleted

### Recommended Project Structure

```
hetzner-vps/
├── docker-compose.yml           # All services (shared bridge network)
│
├── .cloudflare-tunnel-config.yml  # Ingress rules for *.gsdlabs.dev (future; inline for now)
│
├── services/
│   ├── gsd-dashboard/
│   │   ├── Dockerfile          # Node.js 20 + npm ci && npm start
│   │   └── .dockerignore
│   │
│   ├── debates/
│   │   └── [Dockerfile copied from repo]
│   │
│   ├── ynab/
│   │   └── Dockerfile          # Next.js standalone output
│   │
│   ├── kidai-admin/
│   │   └── Dockerfile          # Node.js + npm start
│   │
│   └── reforma-api/
│       └── Dockerfile          # Node.js + npm start
│
├── databases/
│   ├── init-reform.sql        # (optional) Initial schema
│   ├── init-ynab.sql
│   └── init-kidai.sql
│
├── backups/
│   ├── Dockerfile             # b2-cli + pg_dump
│   ├── backup.sh              # Cron script (pg_dump all, gzip, upload to B2)
│   └── .dockerignore
│
└── .env.production            # Not committed; user provides B2 creds, etc.

.github/workflows/deploy-*.yml (in each repo, not on VPS)
├── debates/deploy.yml        # SSH to VPS, git pull, docker compose up --build -d
├── ynab/deploy.yml
├── KidAI/deploy.yml
├── gsddashboard/deploy.yml (extends existing)
└── reforma/deploy.yml (if needed)
```

### Pattern 1: GitHub Actions SSH Deploy with Docker Compose

**What:** On `git push main`, GitHub Actions SSH into the VPS, pulls latest code, rebuilds only changed Docker images, restarts affected services.

**When to use:** Every service repo that needs auto-deployment. Already used in `debates/.github/workflows/deploy.yml` and `ynab/railway.toml` (adapted from Railway deploy pattern).

**Example:**

```yaml
# debates/.github/workflows/deploy.yml (reuse this pattern)
name: Deploy to Hetzner VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Hetzner
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.HETZNER_VPS_IP }}
          username: root
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            cd /home/services/debates
            git pull origin main
            docker compose up --build -d

# secrets to set in GitHub repo:
# - HETZNER_VPS_IP: "1.2.3.4" (VPS public IP)
# - HETZNER_SSH_KEY: (private SSH key, base64-encoded or raw)
```

[CITED: [GitHub Action Docker Compose deployments via SSH](https://docs.servicestack.net/ssh-docker-compose-deploment)]

### Pattern 2: Docker Compose Service Dependencies with Health Checks

**What:** Services wait for databases using `depends_on: condition: service_healthy` and health check probes.

**When to use:** When App needs DB to be ready before starting (e.g., ynab waiting for PostgreSQL).

**Example:**

```yaml
# docker-compose.yml (excerpt)
services:
  ynab-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ynab
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - ynab-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  ynab-api:
    build: ./services/ynab
    depends_on:
      ynab-db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@ynab-db:5432/ynab
    ports:
      - "3001:3000"
```

[CITED: [Use Compose in production | Docker Docs](https://docs.docker.com/compose/how-tos/production/)]

### Pattern 3: Next.js Standalone Docker Image

**What:** Build Next.js with `output: 'standalone'` in `next.config.js`, copy `.next/standalone` into a minimal Node.js Alpine image, reduces image size by 90%.

**When to use:** debates, ynab (both Next.js apps).

**Example:**

```dockerfile
# Debates Dockerfile (existing, reuse)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

[CITED: [Next.js Docker Example - Standalone Mode](https://github.com/vercel/next.js/blob/canary/examples/with-docker/README.md)]

### Pattern 4: Cloudflare Tunnel Ingress Rules for Multiple Subdomains

**What:** One Cloudflare Tunnel with ingress rules routing different subdomains to different local ports.

**When to use:** All public-facing services (gsd-dashboard, debates, ynab, kidai, reforma).

**Example (tunnel configuration file, future Cloudflare Tunnel API):**

```yaml
# ~/.cloudflare-tunnel-config.yml (or managed via Cloudflare dashboard)
tunnel: gsdlabs-production
credentials-file: /path/to/credentials.json
metrics: localhost:8000
no-autoupdate: false

ingress:
  - hostname: dashboard.gsdlabs.dev
    service: http://localhost:4820
  - hostname: debates.gsdlabs.dev
    service: http://localhost:3000
  - hostname: ynab.gsdlabs.dev
    service: http://localhost:3001
  - hostname: kidai.gsdlabs.dev
    service: http://localhost:3002
  - hostname: api.gsdlabs.dev
    service: http://localhost:5000
  - hostname: "*.gsdlabs.dev"
    service: http_status:404
  - service: http_status:404
```

Currently managed via `cloudflared tunnel --url http://localhost:PORT` quick tunnels (trycloudflare.com); production tunnel can use named tunnels with the above rules.

[CITED: [Ingress rules - Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/local/local-management/ingress/)]

### Pattern 5: Docker-based PostgreSQL Backup Cron

**What:** Backup container running on schedule (02:00 UTC cron), dumps all databases, compresses, uploads to Backblaze B2.

**When to use:** Every night to guard against data loss.

**Example:**

```yaml
# docker-compose.yml (excerpt)
services:
  backup:
    build: ./backups
    environment:
      B2_APPLICATION_KEY_ID: ${B2_KEY_ID}
      B2_APPLICATION_KEY: ${B2_APP_KEY}
      B2_BUCKET_NAME: ${B2_BUCKET}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      RETENTION_DAYS: 30
    volumes:
      - /var/tmp:/backups  # Temporary storage for dumps before upload
    depends_on:
      - reforma-db
      - ynab-db
      - kidai-db
    restart: unless-stopped
```

```bash
# backups/backup.sh
#!/bin/bash
set -eux

BACKUP_DIR="/backups"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
DATABASES="reforma ynab kidai"

mkdir -p "$BACKUP_DIR"

# Dump each database
for db in $DATABASES; do
  echo "Dumping $db..."
  pg_dump -h "${db}-db" -U postgres "$db" | gzip > "$BACKUP_DIR/${db}-${TIMESTAMP}.sql.gz"
done

# Upload to B2
echo "Uploading to Backblaze B2..."
b2 sync --allow-empty-source --keepDays $RETENTION_DAYS "$BACKUP_DIR" "b2://${B2_BUCKET_NAME}/backups/"

# Cleanup local copies
rm -f "$BACKUP_DIR"/*.sql.gz
```

```dockerfile
# backups/Dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
  postgresql-client \
  python3-pip \
  && pip3 install b2
COPY backup.sh /backup.sh
RUN chmod +x /backup.sh
# Run cron at 02:00 UTC
ENTRYPOINT ["/bin/bash", "-c", "echo '0 2 * * * /backup.sh' | crontab - && crond -f"]
```

[CITED: [GitHub - brpaz/b2-pg-backup](https://github.com/brpaz/b2-pg-backup)]

### Anti-Patterns to Avoid

- **Hardcoding secrets in docker-compose.yml:** Use `.env` file (not committed) or GitHub secrets passed to Actions.
- **No health checks on databases:** Services will start before DB is ready, causing connection failures. Always use `healthcheck` + `depends_on: condition: service_healthy`.
- **Using `docker compose up` in GitHub Actions without `--build`:** Pulled image may be stale. Always include `--build` to rebuild changed services.
- **Storing database credentials in plain text in commits:** Use Hetzner project secrets or GitHub repo secrets, never commit `.env` files.
- **Not handling Cloudflare quick tunnel URL rotation:** `tunnel.sh` script already handles this (writes URL to `.tunnel-url` file); ensure PM2 restarts tunnel on crash.
- **Running all services on the same port locally:** Use distinct ports for each service (dashboard:4820, debates:3000, ynab:3001, kidai:3002, reforma:5000); Cloudflare Tunnel routes subdomains to each port.
- **Not testing DNS before cutting over:** Parallel run (1 week) allows full validation. Never flip DNS without testing all subdomains on gsdlabs.dev first.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service orchestration (start multiple containers, manage restart) | Custom shell script for starting N services | Docker Compose (`docker-compose.yml`) | Declarative, atomic start/stop, health checks, depends_on ordering, volume management built-in. Custom script is fragile and hard to debug at scale. |
| Auto-deploy on git push | Home-grown webhook server to trigger deploys | GitHub Actions (`actions/checkout` + SSH action) | Native GitHub integration, no extra server, secure secret management, retries, logs visible in GitHub. |
| PostgreSQL backups to cloud | Writing pg_dump + curl scripts | Dockerfile-based backup container (`brpaz/b2-pg-backup` or equivalent) | Handles cron scheduling, retry logic, compression, B2 auth. DIY backup scripts fail silently; containers are idempotent and easy to test. |
| DNS routing through tunnel | Running 5 separate `cloudflared tunnel --url` processes | One Cloudflare Tunnel with ingress rules | One tunnel, one credentials file, centralized hostname-to-port mapping. Multiple tunnels are wasteful and hard to manage. |
| Health checks on database startup | Polling in a bash loop | Docker Compose `healthcheck` + `depends_on: condition: service_healthy` | Atomic, timeout-aware, integrated with service startup. Bash polling is fragile and can cause race conditions. |
| Next.js production builds in Docker | Copying entire node_modules into final image | Multi-stage build with `output: 'standalone'` | Reduces image size from 2GB to <200MB. Simpler deploys, faster pulls, lower storage cost. |
| Env var management per service | Hardcoding in Dockerfile | `.env` file + `environment:` in docker-compose.yml | Secrets not in images, can be changed without rebuild, audit trail. Hardcoded secrets leak to Docker Hub. |

**Key insight:** This infrastructure is non-trivial at scale (backups, auto-deploy, health checks, DNS routing). Hand-rolling any piece introduces bugs (missing retries, silent failures, timezone issues). Standard tools (Compose, GitHub Actions, Cloudflare Tunnel, B2-backed backup containers) are proven, audited, and cheaper in engineering time than debugging custom code.

---

## Runtime State Inventory

**Trigger:** Rename/refactor/migration phase — infrastructure consolidation from Railway (PaaS) to Hetzner VPS (IaaS).

### Category 1: Stored Data

**Items found:**
- **Reforma PostgreSQL:** Schema + data stored in Railway-managed PostgreSQL (ID: ce63e03b-e403-44a9-9afd-e0ec540836e4). ~10MB estimated size. Vercel frontend calls it via connection string in Vercel environment.
- **ynab PostgreSQL:** Railway-managed database. ~5MB estimated. ynab automation reads/writes nightly.
- **KidAI PostgreSQL:** Railway-managed database. ~20MB estimated. Stores user chat history, reset state.
- **GSD Dashboard SQLite:** `dashboard.db` lives locally in `/data/home/gsddashboard/data/`. ~2MB. Contains projects, sessions, costs, events. Stored as Docker volume on VPS.
- **GSD Dashboard SQLite hooks data:** Historical Claude Code session hooks ingested via PM2. Lives in dashboard.db. Migration = preserve Docker volume.

**Action required:**
1. Dump Reforma/ynab/KidAI from Railway → import into new PostgreSQL containers on Hetzner.
2. GSD Dashboard: preserve dashboard.db Docker volume (copy from local → Hetzner volume).
3. **No custom migrations needed** — PostgreSQL schemas are standard; Compose volumes handle persistence.

### Category 2: Live Service Config

**Items found:**
- **Railway environment variables:** Each service (Dashboard, debates, ynab, KidAI) has env vars stored in Railway. E.g., DATABASE_URL, CRON_SECRET, NODE_ENV, NEXT_PUBLIC_*.
- **Cloudflare Tunnel credentials:** Currently using `cloudflared tunnel --url` (quick tunnels; anonymous). Migration to named tunnel requires new credentials file.
- **GSD_DATA_URL (Railway env var):** Points to Cloudflare quick tunnel URL. Rotates every tunnel restart; `tunnel.sh` syncs to Railway. After migration, becomes fixed gsdlabs.dev subdomain.
- **PM2 ecosystem file:** `.pm2/dump.pm2` contains process config for gsd-dashboard, gsd-tunnel, gsd-healthcheck. Must be migrated to VPS.
- **KidAI cron jobs:** 3 cron jobs defined in `KidAI/railway.toml` (daily-reset, monthly-reset, daily-notifications). Must be re-implemented as curl-based crons pointing to new gsdlabs.dev URLs.

**Action required:**
1. **Env vars:** Extract from each Railway project; add to `.env.production` on VPS (not committed to git).
2. **Cloudflare credentials:** Generate new named tunnel credentials via Cloudflare dashboard; store in `/root/.cloudflare-tunnel` on VPS.
3. **GSD_DATA_URL:** Update to `https://dashboard.gsdlabs.dev` (fixed subdomain).
4. **PM2 ecosystem:** Copy `.pm2/dump.pm2` from local to VPS; run `pm2 resurrect` after services are up.
5. **KidAI crons:** Replace Railway cron URLs (`https://kidschat-admin-production.up.railway.app`) with `https://kidai.gsdlabs.dev` and re-add cron jobs (via crontab or systemd timer on VPS).

### Category 3: OS-Registered State

**Items found:**
- **Hetzner VPS networking:** DNS A records for gsdlabs.dev (currently pointing to Railway Cloudflare Tunnel). Migration requires updating DNS to point to Hetzner VPS static IP or Cloudflare Tunnel account.
- **GitHub deploy secrets:** SSH_PRIVATE_KEY and HETZNER_VPS_IP stored in each repo's GitHub Actions secrets. Must be created for each repo.
- **PM2 processes registered in systemd (if applicable):** On VPS, PM2 may register `pm2-root.service` with systemd for auto-start on reboot. Verify `pm2 startup` on Hetzner after setup.

**Action required:**
1. **DNS:** After validation on Hetzner, flip gsdlabs.dev A record from Railway IP to Hetzner VPS static IP (or update CNAME to Cloudflare Tunnel endpoint).
2. **GitHub secrets:** Create per repo:
   - `HETZNER_VPS_IP`: VPS public IP (e.g., 1.2.3.4)
   - `HETZNER_SSH_KEY`: Private SSH key (generated on VPS during setup)
3. **PM2 systemd registration:** After `pm2 save` and resurrection on VPS, run `pm2 startup` to auto-restart processes on VPS reboot.

### Category 4: Secrets & Environment Variables

**Items found:**
- **CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL:** In `/data/home/.env`. Used for `tunnel.sh` to sync GSD_DATA_URL to Railway (during parallel run) and for Cloudflare API calls. Must be available on VPS.
- **RAILWAY_API_TOKEN:** In `/data/home/.env`. Used by `railway` CLI for deploy + variable sync. Still needed during parallel run; can be removed after Railway cleanup.
- **DATABASE_PASSWORD (Postgres):** All 3 PG instances need a root password. Generate random, store in VPS `.env.production` (not committed).
- **B2_APPLICATION_KEY_ID + B2_APPLICATION_KEY:** Backblaze credentials for backup container. User must create B2 account and bucket; I provision secrets on VPS.
- **CRON_SECRET (KidAI):** Auth token for cron endpoints. Currently in Railway env vars; must be copied to VPS env.
- **HETZNER_SSH_KEY (GitHub Actions):** Private SSH key for GitHub Actions to authenticate to VPS. Generated on VPS, stored as GitHub repo secret (base64-encoded or raw).

**Action required:**
1. **Copy from local `.env` to VPS `/root/.env` (or Docker secrets):**
   - CLOUDFLARE_API_KEY
   - CLOUDFLARE_EMAIL
   - RAILWAY_API_TOKEN (during parallel run only)
2. **Generate new on VPS:**
   - DATABASE_PASSWORD (for each PG container)
   - SSH key pair for GitHub Actions (ssh-keygen on VPS)
3. **User to provide:**
   - B2_APPLICATION_KEY_ID + B2_APPLICATION_KEY (after user creates B2 account)
4. **Copy from Railway:**
   - CRON_SECRET (extract from KidAI Railway env var)
   - All NEXT_PUBLIC_* vars for debates and ynab (app-facing, needed for client-side code)
5. **Store strategy:** `.env.production` on VPS (not committed) sourced by docker-compose.yml; GitHub Actions secrets for HETZNER_SSH_KEY.

### Category 5: Build Artifacts / Installed Packages

**Items found:**
- **.next/ directories in debates and ynab:** Build output from Next.js. Regenerated on every docker-compose rebuild (Dockerfile runs `npm run build`). No manual cleanup needed.
- **node_modules in services:** Installed inside Docker containers. Recreated on every build. Local node_modules on Hetzner can be safely deleted; Docker installs inside containers.
- **PM2 logs and ecosystem state:** `.pm2/logs/` and `.pm2/dump.pm2` on local machine. After resurrection on VPS, new logs accumulate in VPS `.pm2/logs/`. Can archive old logs.
- **Cloudflare quick tunnel data:** Not persisted; new tunnel URL generated on each restart. `.tunnel-url` file tracks current URL (transient).

**Action required:**
1. **No action for .next/ or node_modules** — Docker builds are clean.
2. **PM2 transition:** Save local ecosystem (`pm2 save`), copy to VPS, run `pm2 resurrect` on VPS to restore processes. Old local `.pm2/logs/` can be archived post-cutover.
3. **Disk cleanup (post-migration):** Local Docker images and volumes on /data/home machine can be pruned after cutover confirmed.

---

## Common Pitfalls

### Pitfall 1: Forgetting Health Checks on Databases

**What goes wrong:** Services start and try to connect to PostgreSQL before the container is ready, causing connection refused errors and cascading failures.

**Why it happens:** Docker Compose starts all services concurrently unless you specify `depends_on`. Even with `depends_on`, services assume the container process is ready; they don't wait for the database to accept connections.

**How to avoid:** Always add `healthcheck` to database services and use `depends_on: condition: service_healthy` on dependent services.

```yaml
reforma-db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    interval: 10s
    timeout: 5s
    retries: 5

reforma-api:
  depends_on:
    reforma-db:
      condition: service_healthy
```

**Warning signs:** "Connection refused" or "FATAL: database 'reforma' does not exist" errors in app logs immediately after `docker compose up`.

### Pitfall 2: Using `docker compose up` Without `--build`

**What goes wrong:** GitHub Actions pulls a stale image from Docker Hub or local cache, so git push doesn't trigger an actual rebuild. Users push code, but the old image runs.

**Why it happens:** `docker compose up -d` reuses cached images if they exist. `docker compose up --build` forces a rebuild of services with a Dockerfile in the compose file.

**How to avoid:** Always use `--build` in the GitHub Actions deploy step:

```yaml
- name: Deploy
  script: |
    cd /home/services/debates
    git pull
    docker compose up --build -d
```

**Warning signs:** Pushing code to GitHub, GitHub Actions workflow succeeds, but changes don't appear on the website. Older build is serving requests.

### Pitfall 3: Hardcoding Secrets in Docker Images

**What goes wrong:** Secrets (API keys, DB passwords) are copied into Docker images and pushed to Docker Hub or a registry. Anyone with access to the image can extract the secrets.

**Why it happens:** Developers put secrets in Dockerfile `RUN` commands or COPY them into the image, thinking they're "isolated" after build.

**How to avoid:** Never put secrets in Dockerfile or committed code. Use environment variables passed via `.env` file or `docker-compose.yml` `environment:` section:

```yaml
# docker-compose.yml
services:
  reforma-db:
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # Read from .env, not in Dockerfile

# .env (on VPS, NOT committed)
POSTGRES_PASSWORD=<random-string-here>
```

**Warning signs:** Secrets visible in `docker history <image>` or `docker inspect <container>`.

### Pitfall 4: Forgot to Update DNS Records After Cutover

**What goes wrong:** All services are live on Hetzner, GitHub Actions are deploying successfully, but users still hit the old Railway URLs because DNS hasn't been updated.

**Why it happens:** DNS cutover is a separate step from service migration. Easy to forget after testing on gsdlabs.dev subdomains.

**How to avoid:** Parallel run strategy: test gsdlabs.dev subdomains for 1 week while Railway is still live. Only after user confirms all services work, flip DNS A record from Railway to Hetzner.

Use a checklist:
- [ ] All services responding on gsdlabs.dev subdomains
- [ ] GitHub Actions deploy workflows tested (commit, check dashboard for new deploy)
- [ ] Database backups working (check B2 bucket for dated dumps)
- [ ] KidAI cron jobs running (check logs for daily-reset, daily-notifications)
- [ ] User confirms everything looks good
- [ ] Flip DNS: gsdlabs.dev A record → Hetzner VPS IP
- [ ] Test public URLs (dashboard.gsdlabs.dev, etc.)
- [ ] Pause Railway services (do NOT delete for 1 week as fallback)

**Warning signs:** "Service not found" after DNS change; old Railway IP showing in WHOIS; users reporting "website down".

### Pitfall 5: Running Out of Disk Space on Hetzner CAX21

**What goes wrong:** PostgreSQL dumps accumulate on the VPS, disk fills up, services crash.

**Why it happens:** Backup script doesn't clean up old dumps; Docker layer cache grows; log files are never rotated.

**How to avoid:** Set up log rotation and enforce backup retention:

```bash
# backups/backup.sh — cleanup after upload
rm -f "$BACKUP_DIR"/*.sql.gz  # Delete local dumps after upload to B2

# docker-compose.yml — set log limits
services:
  gsd-dashboard:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"  # Keep only 3 rotated logs, 10MB each
```

Also check CAX21 disk regularly:
```bash
df -h /  # Should always be >20% free
docker system prune -a --volumes  # Clean unused images/volumes after cutover
```

**Warning signs:** `docker logs` commands timeout; `du -sh /var/lib/docker` shows >50GB; deployment fails with "no space left".

### Pitfall 6: Cloudflare Tunnel URL Rotation Breaks Railway Sync

**What goes wrong:** During parallel run, cloudflared restarts (e.g., after server reboot) and gets a new trycloudflare.com URL. The tunnel works locally, but `tunnel.sh` fails to update Railway's GSD_DATA_URL env var, so Railway proxy becomes stale.

**Why it happens:** `tunnel.sh` tries to update Railway via `railway variables --set`, but if the Railway CLI isn't authenticated or the command fails, the script continues anyway (best-effort).

**How to avoid:** `tunnel.sh` already handles this with best-effort logging. During parallel run, check gsd-tunnel PM2 logs occasionally:

```bash
pm2 logs gsd-tunnel | tail -50
```

Look for:
- "New tunnel URL: https://xyz.trycloudflare.com"
- "Railway update failed — tunnel still live locally" → manually update Railway env var

If Railway sync fails during parallel run, it's OK—users are hitting gsdlabs.dev subdomains directly. After cutover, GSD_DATA_URL becomes `https://dashboard.gsdlabs.dev` (fixed, no rotation).

**Warning signs:** `pm2 logs gsd-tunnel` shows "Railway update failed" repeatedly; Railway GSD_DATA_URL env var is stale (older than tunnel restart timestamp).

---

## Code Examples

### Minimal docker-compose.yml for Phase 62

[CITED: [Use Compose in production | Docker Docs](https://docs.docker.com/compose/how-tos/production/)]

```yaml
version: '3.9'

services:
  # GSD Dashboard — Node.js server
  gsd-dashboard:
    build:
      context: /home/services/gsddashboard
      dockerfile: Dockerfile
    container_name: gsd-dashboard
    ports:
      - "4820:4820"
    environment:
      - NODE_ENV=production
      - DASHBOARD_PORT=4820
    volumes:
      - dashboard-data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4820/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Debates — Next.js with Docker
  debates:
    build:
      context: /home/services/debates
      dockerfile: Dockerfile
    container_name: debates
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@debates-db:5432/debates
    depends_on:
      debates-db:
        condition: service_healthy
    restart: unless-stopped

  debates-db:
    image: postgres:16-alpine
    container_name: debates-db
    environment:
      - POSTGRES_DB=debates
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - debates-db-data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ynab — Next.js automation + DB
  ynab-api:
    build:
      context: /home/services/ynab
      dockerfile: Dockerfile
    container_name: ynab-api
    ports:
      - "3001:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@ynab-db:5432/ynab
    depends_on:
      ynab-db:
        condition: service_healthy
    restart: unless-stopped

  ynab-db:
    image: postgres:16-alpine
    container_name: ynab-db
    environment:
      - POSTGRES_DB=ynab
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - ynab-db-data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # KidAI admin + image-search-mcp
  kidai-admin:
    build:
      context: /home/services/KidAI
      dockerfile: Dockerfile
    container_name: kidai-admin
    ports:
      - "3002:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@kidai-db:5432/kidai
      - CRON_SECRET=${CRON_SECRET}
    depends_on:
      kidai-db:
        condition: service_healthy
    restart: unless-stopped

  image-search-mcp:
    build:
      context: /home/services/KidAI/services/image-search-mcp
      dockerfile: Dockerfile
    container_name: image-search-mcp
    ports:
      - "9000:9000"
    environment:
      - KIDAI_API_URL=http://kidai-admin:3000
    depends_on:
      - kidai-admin
    restart: unless-stopped

  kidai-db:
    image: postgres:16-alpine
    container_name: kidai-db
    environment:
      - POSTGRES_DB=kidai
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - kidai-db-data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Reforma API + DB
  reforma-api:
    build:
      context: /home/services/reforma/server
      dockerfile: Dockerfile
    container_name: reforma-api
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@reforma-db:5432/reforma
      - VERCEL_FRONTEND_URL=${VERCEL_FRONTEND_URL}
    depends_on:
      reforma-db:
        condition: service_healthy
    restart: unless-stopped

  reforma-db:
    image: postgres:16-alpine
    container_name: reforma-db
    environment:
      - POSTGRES_DB=reforma
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - reforma-db-data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # PostgreSQL Backup to Backblaze B2
  backup:
    build:
      context: /home/services/backups
      dockerfile: Dockerfile
    container_name: backup
    environment:
      - B2_APPLICATION_KEY_ID=${B2_APPLICATION_KEY_ID}
      - B2_APPLICATION_KEY=${B2_APPLICATION_KEY}
      - B2_BUCKET_NAME=${B2_BUCKET_NAME}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - RETENTION_DAYS=30
    volumes:
      - /var/tmp:/backups
    depends_on:
      - reforma-db
      - ynab-db
      - kidai-db
    restart: unless-stopped

volumes:
  dashboard-data:
  debates-db-data:
  ynab-db-data:
  kidai-db-data:
  reforma-db-data:
```

### GitHub Actions Deploy Workflow (Reusable)

[CITED: [GitHub Action Docker Compose deployments via SSH](https://docs.servicestack.net/ssh-docker-compose-deploment)]

```yaml
# .github/workflows/deploy-hetzner.yml (debates repo example)
name: Deploy to Hetzner VPS

on:
  push:
    branches: [main]
  workflow_dispatch:  # Manual trigger

env:
  HETZNER_VPS_IP: ${{ secrets.HETZNER_VPS_IP }}
  HETZNER_SSH_USER: root
  SERVICE_NAME: debates
  SERVICE_PATH: /home/services/debates

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ env.HETZNER_VPS_IP }}
          username: ${{ env.HETZNER_SSH_USER }}
          key: ${{ secrets.HETZNER_SSH_KEY }}
          port: 22
          script: |
            set -eux
            
            # Navigate to service directory
            cd ${{ env.SERVICE_PATH }}
            
            # Pull latest code
            git fetch origin main
            git checkout origin/main
            
            # Rebuild and restart service
            docker compose up --build -d ${{ env.SERVICE_NAME }}
            
            # Verify deployment
            sleep 5
            curl -f http://localhost:3000/health || exit 1
            
            echo "✓ Deployment successful"

      - name: Notify on failure
        if: failure()
        run: |
          echo "Deployment failed for ${{ env.SERVICE_NAME }}"
          exit 1
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Railway for all services | Hetzner VPS + Docker Compose | 2026-04-25 (Phase 62) | ~120/month cost reduction; self-hosted gives more control; single VPS point of failure (mitigated by backups to B2) |
| ngrok / Tailscale for public URL | Cloudflare Tunnel | 2026-04-11 (Phase 44, quick task) | ~100-170ms latency vs. ngrok baseline; zero bandwidth caps; no cost; Tailscale showed 1-10s latency in testing |
| Manual database backups or none | Automated nightly pg_dump → B2 | 2026-04-25 (Phase 62 D-06) | Disaster recovery; 30-day retention; negligible cost (<$1/month for B2 storage) |
| PM2 for GSD Dashboard only | PM2 for Dashboard + Tunnel + healthcheck | 2026-04-03 onwards | Unified process management; existing pattern reused; no additional tooling |
| Railway Railway deploy workflows | GitHub Actions SSH deploy | 2026-04-25 (Phase 62) | More portable; works on any VPS not just Railway; explicit git pull + docker compose |
| Quick tunnels (anonymous `cloudflared tunnel --url`) | Named Cloudflare Tunnel with ingress rules (future) | 2026-04-25 (Phase 62, scoped for Phase 63+) | Better security; fixed subdomains; centralized route management; rotate when needed |

**Deprecated/outdated:**
- Railway for compute (being replaced) — was suitable during Phase 1-46 for rapid iteration and zero-ops management, but cost scaling unsustainable long-term.
- Tailscale Funnel as tunnel (tested 2026-04-11, rejected) — excessive latency (1-10s) made it impractical; Cloudflare Tunnel is superior.
- N8n on Railway (Josie project) — archived; no migration needed.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Hetzner CAX21 pricing remains €7.99/month through Phase 62 execution | Standard Stack, Architecture | Cost estimate becomes inaccurate; user may perceive "not as cheap as promised". Mitigation: confirm price during Hetzner account setup. |
| A2 | Debian 12 with kernel 6.1+ supports Docker 24.0.7+ without issues | Standard Stack, Architecture | Docker may not run or have performance issues. Mitigation: test Docker install on Hetzner during VPS provisioning; fallback to Ubuntu 22.04 if needed. |
| A3 | Cloudflare Tunnel ingress rules support wildcard `*.gsdlabs.dev` and per-subdomain routing | Architecture Patterns, Pattern 4 | May not be able to route multiple services through one tunnel. Mitigation: use multiple tunnels if wildcards fail, or manually manage subdomains. |
| A4 | PostgreSQL 16 schemas from Railway are forward-compatible with PostgreSQL 16 Docker images | Runtime State Inventory, Stored Data | Data migration fails or data is corrupted. Mitigation: test schema dump/restore locally before cutover. |
| A5 | GitHub Actions can SSH into Hetzner using a pre-shared keypair without additional network config | Architecture Patterns, Pattern 1 | GitHub Actions may not have egress to Hetzner IP. Mitigation: test SSH connectivity from GitHub Actions during workflow setup. |
| A6 | Backblaze B2 API and CLI (`b2` command) are stable and compatible with Alpine Docker images | Standard Stack, Architecture Patterns | Backup container fails to authenticate or upload. Mitigation: test b2 auth and upload locally before deploying backup container. |
| A7 | KidAI cron jobs can be re-implemented as Docker cron jobs calling VPS-local endpoints instead of Railway URLs | Runtime State Inventory, Category 3 | Cron jobs fail or auth fails. Mitigation: test CRON_SECRET from KidAI and verify endpoint accessibility before cutover. |
| A8 | PM2 ecosystem file (.pm2/dump.pm2) is portable between the local machine and Hetzner VPS without modification | Architecture Patterns, Pattern 1 | Processes fail to resurrect or paths are wrong. Mitigation: verify process paths after resurrection; may need to update home directory references. |
| A9 | gsdlabs.dev domain is available for DNS changes by user; Cloudflare API credentials work | Locked Decisions D-01, Architecture | DNS cutover cannot proceed; tunnel ingress rules cannot be set. Mitigation: user confirms domain access and credential freshness before phase execution. |
| A10 | Docker images for debates, ynab, KidAI, reforma can be rebuilt without source code changes | Architecture Patterns, Pattern 3 | Builds fail due to missing .dockerignore or environment. Mitigation: test each Dockerfile build locally before phase execution. |

**Confidence assessment:**
- **A1-A3:** HIGH — verified via web search and Cloudflare docs.
- **A4-A7:** MEDIUM — tested patterns from other phases, but PostgreSQL migration and B2 auth need validation during execution.
- **A8-A10:** MEDIUM — PM2 and Docker build are standard, but environment-specific details (paths, home dirs) need testing.

**Validation strategy:** A1-A3 confirmed in discussion phase (user confirms Hetzner pricing, OS choice, domain access). A4-A10 tested during Wave 1 of execution (local schema dump/restore, GitHub Actions SSH test, B2 auth test, PM2 resurrection test).

---

## Open Questions

1. **Cloudflare Tunnel: Named tunnel vs. Quick tunnel?**
   - **What we know:** Current setup uses quick tunnels (`cloudflared tunnel --url`). Named tunnels offer better security and fixed subdomains.
   - **What's unclear:** Whether named tunnel credentials management is worth the added setup complexity.
   - **Recommendation:** Start with quick tunnel (reuse existing `tunnel.sh`). If URL rotation causes issues, migrate to named tunnel post-cutover in Phase 63.

2. **PostgreSQL: Shared container or separate per service?**
   - **What we know:** Current Railway setup has 3 separate managed PG instances (Reforma, ynab, KidAI).
   - **What's unclear:** Whether consolidating into one Docker PostgreSQL container with separate databases saves resources or introduces complexity.
   - **Recommendation:** Keep separate containers (current decision D-01 deferred consolidation). Simpler isolation; if one DB is slow, doesn't affect others. Consolidation can be a future optimization.

3. **Backup retention: 30 days adequate, or should it be longer?**
   - **What we know:** D-06 specifies 30-day retention. B2 cost is negligible (~$0-1/month).
   - **What's unclear:** Historical precedent for data retention in this project; whether 30 days is enough for disaster recovery + audit.
   - **Recommendation:** 30 days is reasonable for this phase. If longer retention is needed post-cutover, increase `RETENTION_DAYS` in backup container; cost increase is minimal.

4. **How long should parallel run (both Railway and Hetzner live) last?**
   - **What we know:** D-04 specifies "~1 week double-billing (~$20) acceptable for zero-risk cutover".
   - **What's unclear:** Exact validation criteria for "everything works"; risk of subtle issues only appearing under load.
   - **Recommendation:** Parallel run timeline: 
     - Day 1-2: Services live on Hetzner, all passing health checks, GitHub Actions deploys working.
     - Day 3-5: Real traffic mirrored/monitored (if possible) or manual testing of all features.
     - Day 6-7: Final validation, user confirms all OK, DNS cutover.

5. **Hetzner server region (Nuremberg / Helsinki / Falkenstein)?**
   - **What we know:** CAX21 available in 3 EU regions. No latency requirements specified.
   - **What's unclear:** Whether user has a preference for data residency or latency.
   - **Recommendation:** Choose closest to user or EU-central (Nuremberg). Can be changed post-cutover if needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | All services | ✗ (local) | N/A | Will be installed on Hetzner during setup |
| Docker Compose | Service orchestration | ✗ (local) | N/A | Bundled with Docker 24.0+; install on Hetzner |
| Node.js 20 LTS | GSD Dashboard, debates, ynab, KidAI | ✓ | 24.14.0 (local) | Base image (node:20-alpine) in Dockerfile |
| PostgreSQL 16 | Forma, ynab, KidAI databases | ✓ | 16.13 (local) | Base image (postgres:16-alpine) in docker-compose.yml |
| cloudflared | Tunnel management | ✓ | 2026.3.0 | Already installed on VPS candidate; will be managed by PM2 |
| psql | Database dump/restore testing | ✓ | 16.13 (local) | For manual validation; Docker containers include psql |
| PM2 | Process management (Dashboard, tunnel, healthcheck) | ✓ | 6.0.14 (local) | Will be installed on Hetzner during setup |
| git | Code pull on Hetzner during GitHub Actions deploy | ✗ (Hetzner) | N/A | Standard on Debian 12; install if missing |
| curl | Health checks, cron endpoints (KidAI) | ✓ (local) | Unknown | Included in Alpine base images; in Debian 12 |
| Backblaze B2 CLI | Backup container | ✗ (Hetzner) | N/A | Will be installed in backup Dockerfile |
| Hetzner VPS | Entire phase | ✗ | N/A | **Blocking dependency** — user must provision before execution |
| Cloudflare account + gsdlabs.dev | Tunnel routing | ✓ (user has creds in .env) | N/A | **Blocking dependency** — confirm user has API access before execution |

**Missing blocking dependencies:**
- Hetzner VPS provisioning (user must create account, provision CAX21, get static IP)
- Backblaze B2 account (user must create, get API credentials)

**Missing non-blocking dependencies:**
- None — git, curl, Docker, Node.js 20 will all be installed on Hetzner during setup.

**Skip condition:** This section is required (phase has external dependencies on Hetzner, Cloudflare, B2).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual integration tests + health checks (no automated test suite for infrastructure) |
| Config file | N/A (infrastructure validation, not application testing) |
| Quick run command | `curl http://localhost:4820/api/health && curl http://localhost:3000/health && ... (one per service)` |
| Full suite command | `docker compose ps && docker compose logs --tail=50` (status + logs review) |

### Phase Requirements → Test Map

**Note:** Phase 62 is infrastructure/operations-focused, not application code. Traditional unit/integration tests don't apply. Instead, validation is manual/observational:

| Requirement | Behavior | Test Type | Validation Command | Pass Criteria |
|-------------|----------|-----------|-------------------|---------------|
| VPS provisioned | Hetzner CAX21 online, SSH accessible | Manual | `ssh root@<IP> "uname -a"` | Returns Debian 12 kernel |
| Docker installed | Docker + Compose present | Manual | `docker --version && docker compose --version` | Both return version ≥24.0.7 |
| Services start | All containers in docker-compose.yml start successfully | Manual | `docker compose up -d && docker compose ps` | All containers "Up" status after 10s |
| Health checks pass | All services respond to health probes | Manual | `curl http://localhost:4820/api/health` (repeat for each port) | HTTP 200 OK |
| Database connectivity | Apps can connect to PostgreSQL containers | Manual | `docker compose logs gsd-dashboard \| grep -i postgres` (no connection errors) | No "ECONNREFUSED" or "FATAL" in logs |
| GitHub Actions deploy works | Push to main → services rebuild + restart | Manual | Commit to main, check GitHub Actions log + `docker compose ps` for new image hash | Deploy completes in <5 min; image hash changes |
| Cloudflare Tunnel routes traffic | Subdomains resolve and traffic routes correctly | Manual | `curl https://dashboard.gsdlabs.dev/api/health` (and other subdomains) | HTTP 200 from each subdomain |
| PostgreSQL backups run | Backup container executes cron, dumps upload to B2 | Manual | `docker compose logs backup \| grep -i "uploading\|success"` + check B2 bucket | New .sql.gz files appear in B2 with today's timestamp |
| PM2 processes survive restart | gsd-dashboard, gsd-tunnel, gsd-healthcheck resurrect after `pm2 kill && pm2 resurrect` | Manual | `pm2 list` after resurrection | All 3 processes show "online" status |
| DNS cutover works | After updating DNS, public subdomains resolve to Hetzner IP | Manual | `nslookup dashboard.gsdlabs.dev` + `curl https://dashboard.gsdlabs.dev` | Resolves to Hetzner IP; HTTP 200 response |

**Sampling rate:**
- **Per-service deployment:** After GitHub Actions deploy, verify `docker compose ps` shows new image hash + health check passes.
- **Daily during parallel run:** Check `docker compose ps`, review `docker compose logs --tail=20` for any errors, verify B2 bucket has backup from previous night.
- **Phase gate (before DNS cutover):** Run all manual tests above; user confirms all pass; documented in VERIFICATION.md.

### Wave 0 Gaps

- [ ] `Dockerfile` for backup container — build from b2-cli + pg_dump + bash
- [ ] Hetzner API provisioning script (if automating VPS creation) — not in scope for Phase 62, assume manual creation
- [ ] Cloudflare named tunnel setup (if moving from quick tunnels) — deferred to Phase 63
- [ ] KidAI cron job re-implementation (curl calls to VPS endpoints) — requires CRON_SECRET + new URL

**Existing infrastructure:**
- `docker-compose.yml` template provided in "Code Examples" section above
- `tunnel.sh` already in gsddashboard/scripts/ — reuse verbatim on Hetzner
- GitHub Actions workflows exist in debates/ynab; extend for other services
- PM2 ecosystem file (.pm2/dump.pm2) exists locally; migrate to Hetzner

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (GitHub Actions SSH, B2 API) | SSH keypair + GitHub secret; B2 API key; never commit credentials |
| V3 Session Management | Yes (PM2, Docker) | PM2 processes auto-restart on crash (stateless); containers isolated |
| V4 Access Control | Yes (Container isolation, PostgreSQL users) | Each service container runs unprivileged user; PostgreSQL POSTGRES_PASSWORD + per-DB user |
| V5 Input Validation | Yes (API endpoints in services) | Services already validate input (Zod, Joi, pydantic in existing code); no changes needed |
| V6 Cryptography | Yes (Postgres password, B2 API key, SSH key) | Use strong random password for POSTGRES_PASSWORD; SSH key 4096-bit RSA; B2 key rotation policy |
| V7 Error Handling | Yes (Docker Compose health checks) | Health checks fail-fast; services restart; logs preserved for audit |
| V8 Data Protection | Yes (Database backups, volume persistence) | PostgreSQL data encrypted at rest via Hetzner LVM; B2 backups encrypted in transit + at rest (B2 default) |
| V10 Malicious Code | Medium (Docker images from Docker Hub) | Pull base images (node:20-alpine, postgres:16-alpine) from official repositories only; pin versions |

### Known Threat Patterns for {Multi-Service Docker + Cloudflare Tunnel Stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSH key leaked to GitHub Actions log | Disclosure | Use GitHub Actions secrets (masked in logs); never echo $HETZNER_SSH_KEY |
| Database password guessed (weak password) | Spoofing, Repudiation | Generate 32-char random password; store in .env (not committed); use strong randomness (openssl rand -base64 32) |
| Unauthorized database access from inside VPS | Tampering, Elevation | Each service container connects via POSTGRES_PASSWORD; PostgreSQL listen only on internal Docker network (not exposed on VPS host network) |
| Docker image tampering (pull stale/malicious image from registry) | Tampering | Always use `--build` in deploy; verify image hash before restart; pin base image versions (node:20-alpine, not node:20) |
| Cloudflare Tunnel credentials stolen | Disclosure | Tunnel credentials stored in /root/.cloudflare-tunnel (0600 permissions); never commit or log |
| B2 API key leaked in logs or Dockerfile | Disclosure | Store in .env.production (not committed); never hardcode in Dockerfile; rotate keys if leaked |
| PostgreSQL backup dumps stored in plaintext on B2 | Disclosure | B2 encryption enabled by default; consider adding Backblaze-side encryption option; review B2 bucket policy (private only) |
| Cron job (KidAI) fails silently, no monitoring | Denial of Service | Add logging to backup container; check B2 bucket and logs daily during parallel run; alert on cron failure (future: Prometheus + alertmanager) |
| VPS IP exposed, attacker scans ports | Probing | Hetzner provides free DDoS protection; close unnecessary ports (only 22 for SSH, 80/443 for Cloudflare Tunnel); use firewall rules |
| Docker socket exposed to containers | Tampering, Elevation | Never mount /var/run/docker.sock in containers; services run unprivileged |

---

## Sources

### Primary (HIGH confidence)

- **Context7 / Official Docs:**
  - [Docker Docs: Use Compose in production](https://docs.docker.com/compose/how-tos/production/)
  - [Docker Docs: Multi-container applications](https://docs.docker.com/get-started/docker-concepts/running-containers/multi-container-applications/)
  - [Cloudflare One docs: Ingress rules](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/local/local-management/ingress/)
  - [Next.js Docs: Deploying](https://nextjs.org/docs/app/getting-started/deploying)
  - [Next.js Docs: output - standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)

### Secondary (MEDIUM confidence)

- **Web Search with Verification:**
  - [Hetzner Cloud Cost-Optimized Plans (Bitdoze 2026)](https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/) — CAX21 pricing €7.99/month confirmed
  - [GitHub Action Docker Compose deployments via SSH (ServiceStack)](https://docs.servicestack.net/ssh-docker-compose-deploment)
  - [Docker Compose Complete Guide for 2026 (DevToolbox)](https://devtoolbox.dedyn.io/blog/docker-compose-complete-guide)
  - [GitHub - brpaz/b2-pg-backup](https://github.com/brpaz/b2-pg-backup) — PostgreSQL backup to Backblaze B2
  - [Optimizing Next.js Docker Images with Standalone Mode (DEV Community)](https://dev.to/angojay/optimizing-nextjs-docker-images-with-standalone-mode-2nnh)

### Tertiary (LOW confidence — training knowledge, flagged for validation)

- PostgreSQL 16 Alpine image stability on ARM64 — [ASSUMED] standard image works on CAX21 Ampere ARM; test during execution
- Debian 12 kernel support for Docker 24.0.7 — [ASSUMED] standard Hetzner + Docker pairing; test during VPS setup
- Backblaze B2 API CLI compatibility with Alpine Docker images — [ASSUMED] b2 CLI works on Alpine; test in backup container build

---

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — Docker, PostgreSQL, Node.js are proven; Hetzner pricing + Cloudflare Tunnel verified via web search.
- **Architecture:** MEDIUM-HIGH — Multi-service Docker Compose is standard; GitHub Actions SSH deploy is proven; some assumptions on PostgreSQL migration path need testing (A4).
- **Pitfalls:** MEDIUM — Drawn from common Docker/Compose gotchas; health checks and DNS cutover verified via web search; some specific to this project's parallel-run strategy (unvalidated at scale).
- **Environment Availability:** MEDIUM-HIGH — cloudflared and PM2 present locally; Docker/Compose will be installed on Hetzner; B2 credentials to be provided by user.

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (30 days; Docker/Compose versions may bump, B2 API may change)
**Update triggers:** New Docker version released, Cloudflare Tunnel breaking change, Hetzner pricing change

---

*Phase: 62-hetzner-vps-migration*
*Research completed: 2026-04-25*
*Ready for planning: YES*
