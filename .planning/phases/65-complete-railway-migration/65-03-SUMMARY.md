# Plan 65-03 Summary — Image Import + KidAI Railway Decoupling

**Status:** COMPLETE  
**Date:** 2026-05-04  
**Wave:** 2

## What was built

### DALL-E Image Import
- Extracted `/tmp/railway-dalle-images.tar.gz` into `hetzner-vps_librechat-images` Docker volume
- Used `--strip-components=2` (tar has `./images/<user_id>/file`; volume mounted at `/app/client/public/images`)
- Result: 21 files across 3 user dirs at correct paths in volume

### Restart Webhook (gsd-dashboard)
- Added `server/routes/docker-ops.js` — POST `/api/docker/restart-librechat` protected by `LIBRECHAT_RESTART_SECRET` header
- Mounted at `/api/docker` in `server/index.js` with a cookieAuth bypass (route handles its own auth)
- Added `LIBRECHAT_RESTART_SECRET` to `/home/services/gsddashboard/.env` and reloaded gsd-dashboard via `pm2 restart --update-env && pm2 save`
- Added ufw rule: allow 172.18.0.0/16 → port 4820/tcp (hetzner-vps compose network → host)

### KidAI Route Updates
- `src/app/api/redeploy-librechat/route.ts` — replaced Railway GraphQL redeploy with POST to `LIBRECHAT_RESTART_URL`
- `src/app/api/prompt-editor/deploy/route.ts` — removed Railway CONFIG_PATH variable update (Step 4b); replaced with POST to `LIBRECHAT_RESTART_URL` after Gist update

### docker-compose.yml (kidai-admin)
- Removed: `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_SERVICE_LIBRECHAT_ID`
- Added: `LIBRECHAT_RESTART_URL`, `LIBRECHAT_RESTART_SECRET`
- Added: `extra_hosts: ["host.docker.internal:host-gateway"]`
- Updated: `NEXT_PUBLIC_LIBRECHAT_URL` → `https://librechat.gsdlabs.dev`

### .env.production
- Removed: `KIDAI_RAILWAY_API_TOKEN`, `KIDAI_RAILWAY_PROJECT_ID`, `KIDAI_RAILWAY_ENVIRONMENT_ID`, `KIDAI_RAILWAY_SERVICE_LIBRECHAT_ID`
- Added: `KIDAI_LIBRECHAT_RESTART_URL=http://host.docker.internal:4820/api/docker/restart-librechat`
- Added: `KIDAI_LIBRECHAT_RESTART_SECRET=73b2b8cb47a900f115d9b43b523ec47037ab88f4765673fa08e74625bd9f2e8f`

## Verified

- Volume: 21 files at `<user_id>/<file>` in volume root ✓
- Restart endpoint: returns 200 from kidai-admin container ✓
- librechat restarted and came back up (health: starting → Up) ✓
- kidai-admin no RAILWAY_* env vars in docker inspect ✓
- host.docker.internal:4820 reachable from hetzner-vps compose network ✓

## Deviation from plan

- Added ufw rule for Docker compose subnet (not in original plan) — required because INPUT policy is DROP
- `host-gateway` resolves to 172.17.0.1 (docker0) but container is on 172.18.x.x (compose network); both work after adding ufw rule for 172.18.0.0/16
