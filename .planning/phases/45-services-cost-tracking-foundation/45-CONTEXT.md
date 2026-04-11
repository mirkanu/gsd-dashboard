# Phase 45: Services Cost Tracking Foundation - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

User can see monthly service costs per project on the Services page, sourced from:
1. **Forwarded billing emails** ingested via Pipedream webhook + Claude Haiku parser
2. **Manual cost entries** (one-time and recurring monthly) entered via a dialog
3. **Encrypted credentials storage** (Railway PAT, OpenAI admin key, Vercel token) in SQLite for use by Phase 46 API integrations

Costs roll up per service (monthly total) and per project (rollup sum) on the Services page. Phase 46 will add live API cost fetchers; Phase 45 establishes the storage contract and manual + email pipelines.

</domain>

<decisions>
## Implementation Decisions

### Email ingestion source
- **Pipedream webhook** — NOT Cloudflare Email Routing, NOT Gmail IMAP polling, NOT IMAP at all
- User forwards billing receipts (Gmail → Pipedream inbound email address) for Railway, OpenAI, Anthropic, Vercel
- Pipedream POSTs `trigger.event.headers/body` JSON payload to `/api/webhooks/email` on the dashboard backend
- Mirrors the existing **YNAB project pattern** at `/data/home/ynab/src/app/api/webhook/route.ts` + `/data/home/ynab/src/lib/email.ts` + `/data/home/ynab/src/lib/claude.ts` — reuse the payload shape and helpers as structural reference
- **No webhook auth header** this phase (matches YNAB setup — trusts the Pipedream URL as a secret). May add shared-secret header later if needed.
- Deduplication via `Message-ID` header — `INSERT OR IGNORE` into a `processed_emails` table (or reuse existing events table with a dedup column)

### Email parser
- **Claude Haiku API** (`claude-haiku-4-5`) for structured JSON extraction — NOT regex per-vendor dispatcher (the RESEARCH.md recommendation is overridden)
- Single prompt extracts: `amount`, `service` (Railway/OpenAI/Anthropic/Vercel/Other), `currency`, `date` (ISO), `description`
- Uses `ANTHROPIC_API_KEY` env var (same env var YNAB uses)
- Parser returns null on failure → route inserts a "Needs Review" row (see Unparseable fallback below)
- Budget-friendly: Haiku tokens are cheap; a few receipts per day is negligible

### Vendors in scope
- Railway, OpenAI, Anthropic, Vercel — all 4 handled by the single Claude Haiku parser (no per-vendor code paths)

### Unparseable fallback
- Insert a row into `external_service_costs` with `source='unparsed'` and the raw email body stored (sanitized HTML → text)
- UI shows a "Needs Review" section on the Services page where user can manually edit amount/service/date/project
- Never drop data silently

### Per-project attribution
- **Claude Haiku infers project from email + user-defined rules**
- Step 1: Parser extracts service + amount + date
- Step 2: Match sender email + subject against user-defined mapping rules (`Railway receipts → gsddashboard`, `OpenAI → KidAI`, etc.)
- Rules are a simple table: `(pattern_type, pattern_value, project_key)` where `pattern_type` is `sender` or `subject_contains`
- Rules are editable **inline on the Services page** (small "Mapping Rules" section with add/edit/delete)
- Fallback when no rule matches: `project_key = NULL` → shown in "Unassigned" bucket
- User can reassign "Unassigned" rows to projects via the same Services page UI

### Cost rollup semantics
- **Calendar month** — e.g. "April 2026 Railway bill", matches how invoices actually arrive
- Services page shows current calendar month totals per service + per project rollup
- NOT a rolling 30-day window

### Manual cost entry UX
- **Dialog from Services page** — button opens a shadcn `Dialog` modal
- Fields: service (dropdown of known services), project (dropdown incl. "Unassigned"), amount, currency, date, notes, `recurring_monthly` checkbox
- Recurring entries: **auto-generate a cost row for the current month** via on-read materialization (when `/api/services/costs` is queried, if a recurring entry exists without a row for the current month, synthesize one). No cron job needed.
- Editing/deleting recurring entries affects future materializations, not past materialized rows

### Credential encryption
- **Field-level AES-256-GCM via `node:crypto`** — per research recommendation (skipped in discussion, accepted as default)
- Master key derived from `DASHBOARD_SECRET_KEY` env var via SHA-256 stretch
- New `app_settings` table with `key`, `value_encrypted`, `iv`, `auth_tag`, `updated_at`
- `getSecret(key)` / `setSecret(key, value)` helpers in `server/crypto.js`
- Credentials stored: `railway_pat`, `openai_admin_key`, `vercel_token` (Phase 46 consumes these)
- Credentials UI lives in a new `CredentialsPanel` section on the Services page or Config page (planner decides)

### Mapping rules UI location
- **Inline on Services page** — small "Mapping Rules" section with a table, add/edit/delete rows

### Claude's Discretion
- Schema details for `processed_emails` dedup table (or reuse existing events table)
- Exact column additions to `external_service_costs` (Phase 45 research suggested `source`, `message_id`, `project_key`, `notes` — planner confirms)
- Where `CredentialsPanel` lives visually (Services page vs Config page)
- Exact Haiku prompt template (YNAB's version is a reference, not a literal reuse)
- Whether to reuse YNAB's helper functions verbatim or port them (projects are separate — port, don't import)

</decisions>

<specifics>
## Specific Ideas

- **YNAB project as reference architecture**: `/data/home/ynab/src/app/api/webhook/route.ts`, `/data/home/ynab/src/lib/email.ts`, `/data/home/ynab/src/lib/claude.ts`. Copy the payload parsing pattern and the Haiku prompt structure; adapt for service receipts instead of retail orders.
- **Prior art for dedup**: YNAB uses a `processedEmail` Prisma table keyed on `messageId`. Port this pattern to better-sqlite3 for this project (simple table, UNIQUE index on `message_id`).
- **Activity logging**: YNAB writes an activity log row for every webhook invocation (received / duplicate / parsed / failed). Mirror this so the Services page can show recent ingestion activity.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/db.js`: Already has `external_service_costs` table (from Phase 24) — additive columns only
- `server/routes/`: Existing Express route pattern — new `/api/webhooks/email` + `/api/services/costs` + `/api/app-settings` + `/api/services/rules` routes follow the established shape
- `client/src/pages/ServicesPage.tsx`: Exists from Phase 40 — extend with cost column, rollup, dialog, mapping rules section, credentials panel
- shadcn `Dialog` component: Already in use in this project (confirm via grep)
- `client/src/lib/api.ts`: Established `api.{resource}.{action}` pattern — add `api.services.costs.*`, `api.services.rules.*`, `api.appSettings.*`

### Established Patterns
- **Railway proxy rule**: Email webhook poller/handler lives in `server/` which runs on the local machine (not the Railway container). The `/api/webhooks/email` route runs wherever the proxied backend runs — which is the local machine (via `GSD_DATA_URL` proxy). This is correct — Pipedream POSTs to the Railway URL, Railway proxies to local, local processes the email.
- **Backward-compat APIs**: All new routes are additive; response shapes for existing endpoints (`/api/services/*`) must stay compatible with Phase 40's consumers
- **Better-sqlite3 prepared statements**: Use the patterns in `server/db.js` — don't introduce new ORM
- **`node:crypto` is built-in**: No new dep for AES-GCM
- **Anthropic SDK**: Check if `@anthropic-ai/sdk` is already a dep (YNAB uses it); if not, add it

### Integration Points
- `ServicesPage.tsx`: New sections (Costs table, Mapping Rules, Credentials panel, Needs Review, Add Cost dialog)
- `server/db.js`: New tables (`app_settings`, `processed_emails`, `service_mapping_rules`, `manual_cost_entries`); additive columns on `external_service_costs`
- `server/routes/`: New files for webhooks, services-costs, services-rules, app-settings
- New file `server/crypto.js`: AES-GCM helpers
- New file `server/parsers/claude-email.js` (or similar): Haiku-backed parser

</code_context>

<deferred>
## Deferred Ideas

- **Webhook shared-secret auth** — deferred; may add later if the Pipedream URL leaks or if we move to Cloudflare Email Routing
- **Bulk import of historical receipts** — not in this phase; user can forward old emails one-by-one if needed
- **Currency conversion** — parser captures raw currency but no automatic conversion; Phase 46+ if multiple currencies become an issue
- **Receipt attachments/PDFs** — text/HTML email body only for now; PDF parsing is a future phase
- **Phase 46 API integrations** — Railway GraphQL, OpenAI admin, Vercel — explicitly out of scope, consumes the credentials this phase stores

</deferred>

---

*Phase: 45-services-cost-tracking-foundation*
*Context gathered: 2026-04-11*
