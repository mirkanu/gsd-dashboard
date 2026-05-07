# Railway Teardown Log — Phase 62

**Date:** 2026-05-07
**Purpose:** Record the teardown of Railway services migrated to Hetzner VPS

This log documents the Railway services that must be paused or deleted to eliminate
the ~$127/month Railway compute bill. All services have been migrated and running on
the Hetzner VPS since April 2026 (Plans 01–09b). The parallel run validation confirmed
all VPS services are healthy.

---

## Teardown Actions Required (User: via railway.app dashboard)

The Railway CLI is not available on this machine. All teardown actions must be performed
by the user at https://railway.app. After completing each action, mark the status below.

**Teardown order (lowest risk first — reverse migration order):**

| # | Service | Action | Railway Location | Status | Date | Notes |
|---|---------|--------|-----------------|--------|------|-------|
| 1 | Josie/n8n | DELETE project | Josie project → Settings → Danger Zone | pending | — | Archived project — no data needed |
| 2 | Reforma PostgreSQL | DELETE service | Reforma project → PostgreSQL → Settings → Danger Zone | pending | — | Data migrated to VPS reforma-db in Plan 03 |
| 3 | GSD Dashboard | PAUSE or DELETE | gsd-dashboard project → Deployments → Remove | pending | — | Migrated to VPS PM2 in Plan 04 |
| 4 | Debates | PAUSE deployment | debates project → Deployments → Remove deployment | pending | — | Per D-05: pause, not delete; project retained for potential resume |
| 5 | Ynab app + PostgreSQL | DELETE both | ynab project → each service → Settings → Danger Zone | pending | — | Data migrated to VPS ynab-db in Plan 06 |
| 6 | KidAI (admin + image-search-mcp + PostgreSQL) | DELETE all | kidai project → each service → Settings → Danger Zone | pending | — | Data migrated to VPS kidai-db in Plan 07 |
| 7 | Railway compute subscription | CANCEL or downgrade | railway.app → Account Settings → Billing → Cancel subscription | pending | — | The compute machine itself costs ~$127/month; must cancel to eliminate charge |

---

## How to Pause a Deployment (vs Delete)

- **Pause:** Go to the service → Deployments tab → click the active deployment → "Remove Deployment"
  (the project and settings remain; no active deployment = no charge)
- **Delete a service:** Service → Settings → Danger Zone → Delete Service
- **Delete a project:** Project settings → Danger Zone → Delete Project

---

## Verification After Teardown

After completing all teardown actions, verify at railway.app → Settings → Billing → Usage:

- **Expected:** Near $0 estimate for next billing period
- **Actual:** (fill in after verification)

---

## VPS Health Check (run after teardown)

All of these should still return HTTP 200 after Railway services are removed:

```sh
curl -f https://dashboard.gsdlabs.dev/api/health && echo "Dashboard: OK"
curl -f https://debates.gsdlabs.dev/api/health 2>/dev/null || curl -sf https://debates.gsdlabs.dev | head -1 && echo "Debates: OK"
curl -f https://ynab.gsdlabs.dev/api/health 2>/dev/null || curl -sf https://ynab.gsdlabs.dev | head -1 && echo "Ynab: OK"
curl -f https://kidai.gsdlabs.dev 2>/dev/null | head -1 && echo "KidAI: OK"
```

---

## Post-Teardown Security Action

Per threat T-62-35: After Railway teardown, remove `RAILWAY_API_TOKEN` from
`/home/services/.env.production` and rotate the token in Railway account settings
(Account Settings → Tokens → Revoke).

---

## Summary (fill in after user completes teardown)

- **Services deleted:** (list)
- **Services paused:** (list)
- **Railway billing estimate after teardown:** (fill in)
- **Date completed:** (fill in)
