# Phase 62: Hetzner VPS Migration — Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Provision a Hetzner CAX21 (8 GB ARM VPS, ~$8/month), migrate all active Railway services to it,
configure Cloudflare Tunnel on gsdlabs.dev for public access, establish the VPS as the permanent
Claude CLI SSH host, set up automated PostgreSQL backups, and clean up Railway — reducing the
monthly infrastructure bill from ~$127 to ~$8.

This phase covers infrastructure provisioning, data migration, DNS cutover, and Railway teardown.
It does NOT cover changes to application code, new features, or monitoring dashboards.

</domain>

<decisions>
## Implementation Decisions

### Service Orchestration
- **D-01:** Use **Docker Compose** for all services — one `docker-compose.yml` per logical group,
  `docker compose up -d` to start, automatic restart-on-crash policy. No Coolify, no extra PaaS
  layer. PM2 is retained only for the GSD Dashboard + tunnel (already established pattern on this host).

### Auto-Deploy Pipeline
- **D-02:** **GitHub Actions + SSH** for all services that auto-deploy. On push to `main`:
  Action SSHes into VPS → `git pull` + `docker compose up --build -d`. Pattern already used in
  `debates/.github/workflows/deploy.yml` and `ynab` — reuse that shape.
- **D-03:** Each repo gets its own deploy action scoped to its service. Shared SSH key stored as
  a GitHub Actions secret across relevant repos.

### Migration Sequencing
- **D-04:** **Parallel run, then cut.** Hetzner VPS comes up alongside Railway. All services are
  migrated and verified on Hetzner before any DNS is flipped. Only after the user confirms
  everything works does Railway get shut down. ~1 week double-billing (~$20) is acceptable for
  zero-risk cutover.
- **D-05:** Migration order (lowest risk first):
  1. Forma PostgreSQL (read-heavy, Vercel calls it — easy to switch connection string)
  2. GSD Dashboard (already runs as PM2 on this host — essentially a lift-and-shift)
  3. Debates (no persistent data — just redeploy)
  4. Ynab (Next.js + PostgreSQL)
  5. KidAI admin + image-search-mcp + PostgreSQL (most complex — last)
  6. Josie: **delete** from Railway entirely (archived project, no migration needed)

### Database Backup Strategy
- **D-06:** **Nightly pg_dump → Backblaze B2.** Cron job at 02:00 UTC dumps all databases,
  compresses, and uploads to a B2 bucket. Retention: 30 days. B2 cost: ~$0/month at current
  database sizes. This runs as a Docker container on the VPS alongside the services.
- **D-07:** Backblaze B2 credentials to be provisioned during setup (user creates B2 account and
  bucket; I configure the backup container).

### Claude's Discretion
- Exact subdomain naming on gsdlabs.dev (e.g. `dashboard.gsdlabs.dev`, `kidai.gsdlabs.dev`)
- SSH keypair generation and storage location on VPS
- Cloudflare Tunnel architecture (one tunnel with multiple ingress rules vs per-service tunnels)
- Docker network topology (shared bridge vs per-service networks)
- Hetzner server OS (Debian 12 recommended — stable, well-supported)
- Whether Ynab and Reforma PostgreSQL share one PostgreSQL container or run separately

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Service Configs
- `.railway/config.json` — all Railway project IDs, service IDs, environment IDs for every service
- `gsddashboard/railway.toml` — GSD Dashboard Railway build/deploy config
- `KidAI/railway.toml` — KidAI Railway config (cron jobs, build)
- `KidAI/services/image-search-mcp/railway.json` — image-search-mcp service config
- `debates/railway.toml` — debates build/deploy config (Dockerfile-based)
- `ynab/railway.toml` — ynab build/deploy config
- `reforma/CLAUDE.md` — confirms Reforma frontend is on Vercel; only PostgreSQL is on Railway

### Existing Deploy Workflows (patterns to reuse)
- `debates/.github/workflows/deploy.yml` — GitHub Actions Railway deploy pattern
- `.github/workflows/deploy.yml` — GSD Dashboard deploy workflow

### Existing PM2 Setup (to preserve on VPS)
- `gsddashboard/scripts/tunnel.sh` — cloudflared tunnel launcher managed by PM2
- PM2 processes: `gsd-dashboard` (port 4820), `gsd-tunnel` (cloudflared), `gsd-healthcheck`

### Credentials Available
- `/data/home/.env` — `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL` (manuelkuhs@gmail.com) for gsdlabs.dev
- `/data/home/.env` — `RAILWAY_API_TOKEN` (deploy-scoped; not account-level)
- `/data/home/gsddashboard/.env` — GSD Dashboard env vars
- Hetzner API token: **not yet provided** — user will paste it before execution begins

### Each Service's Env Vars (researcher must audit)
- `gsddashboard/.env` — dashboard config
- `KidAI/.env` or Railway env vars — KidAI admin config
- `ynab/.env` or Railway env vars — ynab automation config
- `debates/.env` or Railway env vars — debates config

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `debates/.github/workflows/deploy.yml` — GitHub Actions deploy via Railway CLI; adapt SSH deploy shape from this
- `gsddashboard/scripts/tunnel.sh` — cloudflared tunnel script; reuse verbatim on VPS
- `gsddashboard/docker-compose.yml` — existing Docker Compose for GSD Dashboard; extend for all services
- PM2 ecosystem already configured on this SSH host — `pm2 save` output is the migration target

### Established Patterns
- All Node.js services use `npm run build && npm start` or `node server.js` as entrypoint
- KidAI and ynab are Next.js — use standalone output (`output: 'standalone'` in next.config) for Docker
- Debates uses a custom Dockerfile already — lift directly
- PostgreSQL: each service currently has its own Railway managed PG instance

### Integration Points
- GSD Dashboard reads from `~/.claude` (hook data) — on VPS this path must match or be configured
- cloudflared tunnel on VPS replaces the Railway public URL for GSD Dashboard
- KidAI image-search-mcp runs as a sidecar to KidAI admin — keep them on the same Docker network

</code_context>

<specifics>
## Specific Requirements from Discussion

- Hetzner CAX21 specifically (8 GB ARM) — not CAX11, not x86
- gsdlabs.dev is the domain — subdomains per service via Cloudflare Tunnel ingress rules
- Josie/n8n: **delete only**, no migration — it is an archived project
- Debates: **pause** (remove deployment), not delete — might resume later
- Parallel run for ~1 week before Railway teardown — user wants zero-risk cutover
- Backblaze B2 for backups — user will need to create a B2 account before backup setup step

</specifics>

<deferred>
## Deferred Ideas

- Consolidating multiple PostgreSQL instances into one (discussed, deemed not worth the migration
  effort vs savings — each service keeps its own DB container for now)
- Moving Claude CLIs to local PC instead of VPS (decided against — keeping VPS as SSH host)
- Raspberry Pi as alternative to Hetzner (discussed, Hetzner chosen for data-centre reliability
  and zero upfront cost)
- Hostinger / LunaDock alternatives (discussed, Hetzner chosen)
- PRC migration off Vercel/Supabase (PRC is already free on both — no action needed)

</deferred>

---

*Phase: 62-hetzner-vps-migration*
*Context gathered: 2026-04-25*
