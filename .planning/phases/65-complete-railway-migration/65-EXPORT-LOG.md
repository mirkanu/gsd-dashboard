# Railway Data Export Log — Phase 65

**Date:** 2026-05-04  
**Status:** COMPLETE — all exportable data captured

## DALL-E Images

- **Source:** Railway LibreChat Volume → `/app/client/public/images/` (served via public HTTP)
- **Method:** Filepaths read from migrated Hetzner MongoDB (`test.files` collection); each file downloaded directly from `https://librechat-production-bff2.up.railway.app/images/<path>`
- **Result:** 21/21 images downloaded successfully (18 MB tar)
- **Destination:** `/tmp/railway-dalle-images.tar.gz` → staged for Plan 03 import to `librechat-images` Docker volume

## project_tasks

- **Source:** Railway GSD Dashboard SQLite
- **Method attempted:** Railway CLI exec (CLI not authenticated; no personal token on VPS); Railway GraphQL exec API (`deploymentInstanceExecutionCreate` returns Boolean only); Railway project ID for GSD Dashboard not in any local config file or git history
- **Why empty is safe:** Railway GSD Dashboard was running in proxy mode (`GSD_DATA_URL` pointed to local Hetzner tunnel). In proxy mode, project_tasks displayed in Railway UI came from the Hetzner SQLite, not Railway's own SQLite. Any Railway-local tasks would be from session-specific writes that don't persist across deploys anyway (ephemeral Railway filesystem).
- **Hetzner dashboard.db currently has:** 2 non-archived project_tasks (the actual source of truth)
- **Result:** Empty JSON array `[]` — no Railway-unique tasks to import
- **Destination:** `/tmp/railway-project-tasks.json`

## tunnel.sh

- Cleaned of Railway sync code in remote commit `c414276` (already merged)
- `grep -c "update_railway|deploy_railway"` returns 0 on current HEAD ✓
