# Plan 65-01 Summary — LibreChat + Meilisearch on Hetzner

**Status:** COMPLETE  
**Date:** 2026-05-04  
**Wave:** 1

## What was built

- Added `meilisearch` (v1.6) and `librechat` (latest) services to `/home/services/hetzner-vps/docker-compose.yml`
- Added named volumes: `meilisearch-data`, `librechat-images`, `librechat-logs`
- Added LibreChat env vars to `/home/services/.env.production`:
  - `LIBRECHAT_MONGO_URI`, `LIBRECHAT_MEILI_HOST`, `LIBRECHAT_MEILI_KEY`
  - `LIBRECHAT_JWT_SECRET`, `LIBRECHAT_JWT_REFRESH_SECRET`
  - `LIBRECHAT_DOMAIN`, `LIBRECHAT_CONFIG_PATH`
- Added Cloudflare Tunnel ingress rule for `librechat.gsdlabs.dev → http://localhost:3004`
- Restarted `gsd-tunnel` PM2 process

## Health check fixes (deviations from plan)

- Meilisearch image has no `wget` — changed health check to `curl`
- LibreChat image has no `curl` or `wget` — changed to `node -e` HTTP check
- LibreChat `/api/health` returns 404 — changed health check to check `/` (returns 200)

## Verified

- `meilisearch`: Up, healthy ✓
- `librechat`: Up, healthy, HTTP 200 on port 3004 ✓
- Cloudflare ingress rule present in config.yml ✓
- `gsd-tunnel` online ✓

## Pending (manual)

- Add Cloudflare DNS CNAME record: `librechat` → `093489ad-5644-4b42-a6c6-32c45c244fed.cfargotunnel.com` (proxied)
  - `cloudflared tunnel route dns` failed — no origin cert at CLI level
  - Add via Cloudflare dashboard → DNS → CNAME librechat → tunnel ID above

## docker-compose invocation

Always use `--env-file /home/services/.env.production` when running from `/home/services/hetzner-vps`:
```bash
docker compose --env-file /home/services/.env.production up -d <service>
```
