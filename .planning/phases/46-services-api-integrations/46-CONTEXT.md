# Phase 46: Services API Integrations - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning
**Note:** User opted to skip discussion and accept Claude's recommendations. All decisions below are Claude's calls, made pragmatically given what Phase 45 shipped.

<domain>
## Phase Boundary

Services page shows 7-day uptime sparklines and live costs from Railway/OpenAI/Vercel APIs, using credentials stored in Phase 45's `app_settings` table. API-sourced rows live in `external_service_costs` alongside email-parsed rows with dedup.

What this phase does NOT do: status alerting, long-term historical dashboards, project-level Railway attribution beyond what Railway's API natively exposes, cost forecasting.

</domain>

<decisions>
## Implementation Decisions

### Vendor scope — credential-gated activation
- **Build all 3 integrations** (Railway, OpenAI, Vercel) in code
- **Gate each on credential presence** — vendor fetcher is a no-op when its `app_settings` credential is not set; UI shows "Not configured — add credential in Credentials panel to enable"
- **Currently populated:** only `railway_pat` (from `~/.config/railway/config.json` during Phase 45)
- **Not set yet:** `openai_admin_key`, `vercel_token` — user can add later without code changes
- **Why not skip Vercel/OpenAI entirely:** reforma and prc actually use these; user may add keys later. Building the code now means activation is a single credential-paste, not a new phase.
- **Each fetcher lives in `server/services/vendors/<name>.js`** — isolated, independently testable

### Uptime sparkline — new time-series table + background poller
- **New table:** `service_status_checks` with columns `(id, service_name, checked_at, status, latency_ms)` — minimal schema, no project coupling (status is vendor-wide, not per-project)
- **Background poller:** runs every **15 minutes**, gated on `!process.env.GSD_DATA_URL` (local-only, same pattern as Phase 43 project-state poller)
- **Retention:** 7 days rolling — delete rows older than 7d on each poll cycle
- **Data volume:** 7 days × 96 checks/day = 672 rows per service — trivial for SQLite
- **Sparkline read path:** `GET /api/services/status/history?service=Railway` returns the last 7 days of rows for UI rendering
- **Failure modes:** `status='ok' | 'degraded' | 'down' | 'unknown'`; `latency_ms` is null on failure; no retries (next cycle handles it)
- **Why 15min not 5min:** still dense enough for a meaningful sparkline, one-third the write pressure, matches status page refresh rates people actually care about
- **Phase 40 on-demand `fetchStatus` stays as-is** for the realtime status cards; poller writes to history in parallel

### Cost dedup — API wins over email for overlapping periods
- **API-sourced rows use `source='railway_api' | 'openai_api' | 'vercel_api'`** (distinct from Phase 45's `'manual'`, `'email'`, `'unparsed'`)
- **Add two columns to `external_service_costs`:** `period_start` (TEXT ISO) and `period_end` (TEXT ISO) — additive, backward-compat (existing rows get NULL, treated as point-in-time via `checked_at`)
- **Upsert key:** `(service, source, period_start, period_end)` — idempotent inserts, same poll cycle never double-inserts
- **Dedup rule:** when an API row is inserted, DELETE any existing `source='email' OR source='unparsed'` rows for the same `(service, period_start, period_end)`. API is authoritative — emails are fallback when API was down or not yet configured.
- **No merge on period boundaries** — if API returns daily buckets and email was a monthly total, they're distinct periods; UI can display both without conflict. Rare edge case, not worth solving.
- **Display rule:** Services page sums all rows matching the displayed month regardless of source; source badge on hover shows origin

### Refresh cadence — every 6 hours per vendor
- **All 3 fetchers run on a 6-hour cycle** (simple, not rate-limit-prone, far under any vendor's daily allowance)
- **Staggered:** Railway at :00, OpenAI at :20, Vercel at :40 (avoid simultaneous outbound bursts)
- **Gated on `!GSD_DATA_URL`** — local-only (same as the status poller)
- **Last-success timestamp per vendor** stored in `app_settings` as `<vendor>_last_fetched_at` (plain text, not encrypted) — UI displays "updated Xh ago"
- **Degradation:** if last_success > 24h old, UI shows yellow warning icon next to that vendor's cost card
- **No alerting** — failures are logged to `events` table, user notices via the stale indicator
- **Manual refresh button** on Services page: `POST /api/services/refresh-costs?vendor=railway` triggers an on-demand fetch (bypasses the 6h timer) — useful for "I just added a credential, pull now"

### API scope per vendor
- **Railway:** GraphQL `https://backboard.railway.app/graphql/v2`, query `me { workspaces { projects { ... estimatedUsage } } }` or similar — researcher investigates the exact query; goal is monthly spend per project if possible, otherwise account-level total. Store with `project_key` set from Railway project name matching via rules (reuse Phase 45's mapping rules idea) OR leave NULL for "Unassigned".
- **OpenAI:** `https://api.openai.com/v1/organization/usage/completions?start_time=...` (admin API) — returns daily token/$ usage. Write one row per day.
- **Vercel:** `https://api.vercel.com/v1/installations/billing` or similar — returns monthly team billing. Write one row per month.
- **Each client module exports a consistent interface:** `async fetchCostRows(): Promise<Array<{service, cost_usd, currency, period_start, period_end, project_key?}>>` — orchestrator calls it, handles upsert + dedup

### Claude's Discretion
- Exact GraphQL query shape (researcher will investigate)
- Sparkline component library (reuse any existing chart lib in client/ or inline SVG — planner decides)
- Retry backoff specifics on transient API errors
- Whether to show sparkline latency line alongside up/down bars
- Whether to add the `last_fetched_at` display as a small badge or a tooltip

</decisions>

<specifics>
## Specific Ideas

- **Railway graphql endpoint:** `https://backboard.railway.app/graphql/v2` with header `Authorization: Bearer <pat>`
- **OpenAI admin API:** requires an admin key (`sk-admin-...`), NOT a regular API key. Documented at https://platform.openai.com/docs/api-reference/usage
- **Vercel API:** `https://api.vercel.com` — team-level billing endpoints only, requires token scoped to team read
- **Status URL reuse:** the existing `statusUrl` field in `gsd-projects.json` (e.g., `https://railway.instatus.com/api/v2/status.json`) feeds the uptime sparkline poller — no new config needed
- **Sparkline UX reference:** think GitHub's commit activity graph — simple horizontal row of bars/blocks, green=ok, yellow=degraded, red=down. Compact, no axis labels needed.
- **Last-success display:** like "updated 2h ago" under each cost card (similar to how Phase 44 Usage page shows cost freshness)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/routes/services.js:35-68` — existing `fetchStatus(name, statusUrl)` function for on-demand realtime status. Poller will call this in a loop.
- `server/crypto.js` — `getSecret(key)` returns decrypted credential or `null` if missing. Each vendor fetcher calls this at runtime; no plaintext in module cache.
- `server/gsd/proxyStateBroadcaster.js` (Phase 43) — reference pattern for a gated background poller that runs only on local machine
- `external_service_costs` schema from Phase 45 — ready to accept new rows with new `source` values; add `period_start`/`period_end` columns as additive migration
- `app_settings` table — reused for `*_last_fetched_at` non-sensitive metadata (plain text, bypass encryption)
- Phase 45 `api.services.*` client helpers — extend with `api.services.refreshCosts()` and `api.services.statusHistory(service)`

### Established Patterns
- **Backward-compat API:** additive columns only, preserve existing response shapes (backend-node rule)
- **Poller gating:** `if (process.env.GSD_DATA_URL) return;` — mandatory for any background process
- **PROXY_PREFIXES is already updated** for `/api/services/*` (commit `6817e0a`) — no further proxy changes needed for new service endpoints
- **Credentials never logged or returned in plaintext** — the fetcher grabs via `getSecret`, uses in a single HTTP call, done
- **Prepared statements in `server/db.js`** — follow that pattern for new `service_status_checks` queries

### Integration Points
- `server/index.js` — register new status poller alongside existing broadcasters, gated on `!GSD_DATA_URL`
- `server/db.js` — new `service_status_checks` table + additive columns on `external_service_costs`
- New files: `server/services/vendors/{railway,openai,vercel}.js` — one per vendor
- New file: `server/services/cost-fetcher.js` — orchestrator that reads credentials, calls each vendor, upserts rows, handles dedup
- New file: `server/services/status-poller.js` — background poller for sparkline data
- `server/routes/services.js` — add `/api/services/status/history?service=X` and `/api/services/refresh-costs?vendor=X`
- `client/src/components/services/UptimeSparkline.tsx` — new component (simple SVG)
- `client/src/components/services/CostsTable.tsx` — extend to show API-source badges and last-fetched indicators

</code_context>

<deferred>
## Deferred Ideas

- **GitHub billing API** — not in scope; GitHub is free for this user's usage tier
- **Anthropic billing API** — already tracked via Phase 44 Usage page (token_usage table); out of scope here
- **Alerting on vendor outages** — just show the status; notifications belong in a separate "Observability" phase
- **Historical cost charts** — 7 days is enough for now; trend lines are Phase 47+ territory
- **Project-level cost attribution for Railway** — attempt in Plan N but accept "Unassigned" bucket if the GraphQL query can only return account-level totals
- **Rate limit handling beyond a single retry** — if a vendor returns 429, log + wait for next cycle; no exponential backoff
- **Cost forecasting / budget alerts** — nice-to-have, separate phase
- **Uptime SLA calculation** — `% uptime over 7 days` number displayed next to sparkline — could add as a tiny polish task if trivial, otherwise defer

</deferred>

---

*Phase: 46-services-api-integrations*
*Context gathered: 2026-04-11 (Claude's recommendations; user skipped discussion)*
