---
phase: 45-services-cost-tracking-foundation
verified: 2026-04-10T00:00:00Z
status: human_needed
score: 4/4 must-haves verified (automated); 1 pending human UI check
human_verification:
  - test: "Visit https://gsd-dashboard-production.up.railway.app/services and confirm all 5 new sections render (Costs Table, Needs Review, Mapping Rules, Credentials, Add Cost dialog)"
    expected: "Sections render alongside existing Phase 40 status cards; no console errors; skeleton -> real data transitions smoothly"
    why_human: "Visual rendering, layout quality, skeleton/shimmer behavior cannot be verified by curl or grep"
  - test: "Click Add Cost, fill form with service=Railway, amount=12.50, recurring=false, and submit"
    expected: "Row appears immediately in CostsTable under Railway; project rollup updates; delete button cascades"
    why_human: "Full UI flow (dialog open, form validation, optimistic update) requires a real browser"
  - test: "Add a mapping rule (pattern_type=sender, pattern_value=railway.app, project_key=gsddashboard) via the UI, then POST the railway.json fixture to /api/webhooks/email"
    expected: "Cost row appears with source=email, project_key=gsddashboard; duplicate POST returns status:duplicate"
    why_human: "End-to-end webhook+rule+UI integration requires interactive testing"
  - test: "Set a credential via Credentials Panel, reload page"
    expected: "Row shows '•••• (saved ...)'; reload preserves it; GET /api/app-settings returns no plaintext value"
    why_human: "User explicitly skipped browser UI testing; must confirm redaction and persistence visually"
---

# Phase 45: Services Cost Tracking Foundation — Verification Report

**Phase Goal:** User can see monthly service costs per project from email receipts and manual entries, with credentials stored encrypted in SQLite for use by future API integrations.
**Verified:** 2026-04-10
**Status:** human_needed (all automated checks passed; UI flows flagged for user confirmation since user skipped browser testing during execution)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Forwarded billing receipt → parser extracts amount/date/service → row inserted into `external_service_costs` | VERIFIED | `server/routes/webhooks-email.js` calls `parseServiceReceipt` (line 59), resolves project via `resolveProjectKey`, inserts cost row with `source='email'`, `notes='email:<msgid>'`; unparsed path inserts with `source='unparsed'` and `raw_body`; dedup via `INSERT OR IGNORE INTO processed_emails`; `/api/webhooks/email` returns 200 on live URL; 6 webhook integration tests + 33 pipedream/resolver tests pass (per 45-03-SUMMARY) |
| 2 | User can manually enter a fixed monthly cost and it appears as a cost line on the Services page | VERIFIED (backend+UI code) / NEEDS HUMAN (browser flow) | `POST /api/services/costs` in `server/routes/services.js:307` inserts into `manual_cost_entries` and (non-recurring) cascades to `external_service_costs` with `notes='manual:<muid>'`. Recurring entries materialize on read for current month only via `materialize` transaction (line 208). `AddCostDialog.tsx` (248 lines) calls `api.services.costs.create`. Live `/api/services/costs` returns valid envelope `{month, services, projects, needs_review, entries}`. Actual click-through requires human verification. |
| 3 | Services page shows cost alongside status — monthly total per service + per-project rollup | VERIFIED (backend) / NEEDS HUMAN (visual) | `ServicesPage.tsx` (294 lines) imports CostsTable, NeedsReviewSection, MappingRulesSection, CredentialsPanel, AddCostDialog. Fetches via `api.services.costs.get(month)`. `GET /api/services/costs` groups rows into `services[]` (with source_breakdown) and `projects[]` (with per-service sub-totals and null=Unassigned bucket). `CostsTable.tsx` (246 lines) renders by-service + by-project tables. |
| 4 | User can store Railway PAT, OpenAI admin key, Vercel token via settings UI (persisted in SQLite), surviving Railway redeploy | VERIFIED | `server/crypto.js` exports `encryptField/decryptField/setSecret/getSecret/listSecretKeys` using AES-256-GCM + SHA-256 key derivation from `DASHBOARD_SECRET_KEY`; `app_settings` table created in `server/db.js:311`; `/api/app-settings` CRUD wired in `server/index.js:69`; `CredentialsPanel.tsx` (189 lines) calls `api.appSettings.list/set/delete`, never renders plaintext. **Confirmed end-to-end**: live URL `GET /api/app-settings` returns `{"keys":[{"key":"railway_pat","updated_at":"2026-04-11T19:54:23.050Z","set":true}]}` — the Railway PAT stored during execution persisted across deploy and encryption round-trip works. |

**Score:** 4/4 truths verified by automated means. Truths 2 and 3 flagged for human UI confirmation.

### Required Artifacts

| Artifact | Lines | Status | Details |
| -------- | ----- | ------ | ------- |
| `server/db.js` | 728 | VERIFIED | Contains `CREATE TABLE IF NOT EXISTS app_settings` (line 311), `processed_emails` (327), `service_mapping_rules` (342), `manual_cost_entries` (358); 7 additive `ALTER TABLE external_service_costs ADD COLUMN` migrations (source/message_id/project_key/notes/currency/description/raw_body, lines 377-395); `CREATE UNIQUE INDEX idx_service_costs_msgid` (line 399) |
| `server/crypto.js` | 94 | VERIFIED | Uses `aes-256-gcm`, `createCipheriv` with `DASHBOARD_SECRET_KEY`-derived key; exports all 5 required functions; `setSecret` uses INSERT OR REPLACE via `upsertSecret` prepared statement on `app_settings`; `getSecret` returns null defensively on decrypt failure |
| `server/__tests__/crypto.test.js` | — | VERIFIED | 7 unit tests per SUMMARY (round-trip UTF-8/emoji, tamper, wrong-key, missing-key, DB round-trip) |
| `server/routes/app-settings.js` | 58 | VERIFIED | 4 routes (GET list, GET :key, PUT :key, DELETE :key); uses `listSecretKeys`+`setSecret` from crypto; never returns plaintext |
| `server/routes/services.js` | 423 | VERIFIED | Existing `/status` intact (line 76); new `/costs` GET/POST/PATCH/DELETE (lines 228/307/353/397); `materialize` transaction guarded to `currentMonth()` only; cascade to `manual_cost_entries` via `notes` prefix |
| `server/routes/services-rules.js` | 70 | VERIFIED | CRUD on `service_mapping_rules`; pattern_type validation ('sender'/'subject_contains') |
| `server/lib/pipedream.js` | 66 | VERIFIED | 5 pure helpers exported; `extractDate` normalizes RFC 2822 → ISO with fallback to now |
| `server/services/email-parser.js` | 69 | VERIFIED | Uses `@anthropic-ai/sdk` with `claude-haiku-4-5-20251001`; strips markdown fences; validates shape; returns null on any failure |
| `server/services/mapping-resolver.js` | 33 | VERIFIED | Case-insensitive sender/subject match; first match wins; optional service filter |
| `server/routes/webhooks-email.js` | 117 | VERIFIED | POST handler is async; `INSERT OR IGNORE` dedup via `processed_emails`; parser failure → `source='unparsed'` row with `raw_body`; always returns 200 per webhook contract; monkey-patchable `parserModule` require for tests |
| `server/__tests__/email-*.test.js` + fixtures | — | VERIFIED | 4 vendor fixtures (railway/openai/vercel/anthropic); 33+6 tests per SUMMARY |
| `client/src/pages/ServicesPage.tsx` | 294 | VERIFIED | Imports 5 new components; fetches projects once via `api.gsd.projects()`; renders status + costs + needs-review + rules + credentials + dialog |
| `client/src/components/services/CostsTable.tsx` | 246 | VERIFIED | Substantive |
| `client/src/components/services/AddCostDialog.tsx` | 248 | VERIFIED | Calls `api.services.costs.create/update`; supports edit mode |
| `client/src/components/services/MappingRulesSection.tsx` | 216 | VERIFIED | Uses `api.services.rules.list/create/delete` |
| `client/src/components/services/CredentialsPanel.tsx` | 189 | VERIFIED | Uses `api.appSettings.list/set/delete`; input clears after save |
| `client/src/components/services/NeedsReviewSection.tsx` | 200 | VERIFIED | Uses `api.services.costs.update` (promote) and `.delete` (dismiss) uniformly |
| `client/src/lib/api.ts` | — | VERIFIED | `services.costs.*`, `services.rules.*`, `appSettings.*` namespaces added |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `server/crypto.js` | `server/db.js` app_settings | prepared stmts | WIRED | `upsertSecret`, `selectSecret`, `listSecretKeysStmt` all prepared against `app_settings` |
| `server/crypto.js` | `process.env.DASHBOARD_SECRET_KEY` | SHA-256 derive | WIRED | `getKey()` throws descriptive error when unset |
| `server/index.js` | app-settings + services-rules + webhooks-email routers | `app.use(...)` | WIRED | Lines 22-24 require, 67-70 mount |
| `server/routes/app-settings.js` | `server/crypto.js` | `setSecret`/`listSecretKeys` | WIRED | Direct import + call |
| `server/routes/webhooks-email.js` | `email-parser.js` | `await parserModule.parseServiceReceipt(html, subject)` | WIRED | Whole-module require enables monkey-patching in tests |
| `server/routes/webhooks-email.js` | `mapping-resolver.js` | `resolveProjectKey({sender, subject, service})` | WIRED | Called only on parse success |
| `server/routes/webhooks-email.js` | `processed_emails` + `external_service_costs` | INSERT OR IGNORE + insert cost | WIRED | Dedup then sync transaction for DB writes post-await |
| `client/src/pages/ServicesPage.tsx` | `/api/services/costs` | `api.services.costs.get(month)` | WIRED | Line 123 |
| `AddCostDialog.tsx` | `/api/services/costs` | `api.services.costs.create/update` | WIRED | Lines 85-87 |
| `MappingRulesSection.tsx` | `/api/services/rules` | `api.services.rules.*` | WIRED | 3 call sites |
| `CredentialsPanel.tsx` | `/api/app-settings` | `api.appSettings.*` | WIRED | 3 call sites; input cleared after save; no plaintext render |
| `NeedsReviewSection.tsx` | `/api/services/costs/:id` | uniform PATCH (promote) / DELETE (dismiss) | WIRED | Lines 64, 84 |
| Live Railway URL | local SQLite via cloudflared | `/api/services/*`, `/api/app-settings`, `/api/webhooks/email` | WIRED | `curl` returns 200 on all 4 endpoints; `/api/app-settings` contains persisted `railway_pat` row — proxy prefix fix (commit 6817e0a) confirmed working |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SVC-02 | 45-03 | Email billing parser — forward receipts, extract amount/date/service into `external_service_costs` | SATISFIED | webhooks-email.js + email-parser.js + mapping-resolver.js + 4 vendor fixtures + 39 tests; live endpoint returns 200; dedup via `INSERT OR IGNORE`; parser failure fail-safe into `source='unparsed'` |
| SVC-06 | 45-02, 45-04 | Manual cost entry fallback (fixed monthly) | SATISFIED (backend+UI code) / NEEDS HUMAN CLICK-THROUGH | POST /api/services/costs inserts `manual_cost_entries` + `external_service_costs` cascade; recurring materialization guarded to current month; AddCostDialog wired |
| SVC-07 | 45-02, 45-04 | Services page displays cost alongside status — monthly total per service + per-project rollup | SATISFIED (backend+UI code) / NEEDS HUMAN VISUAL | CostsTable + /api/services/costs response envelope with services[] and projects[] (null=Unassigned); ServicesPage renders both sections additively |
| SVC-08 | 45-01, 45-02, 45-04 | Credentials stored in SQLite settings table, not env vars | SATISFIED | AES-256-GCM encryption in crypto.js; CredentialsPanel redacted UI; live verification: railway_pat persisted across deploy; no plaintext ever returned |

No orphaned requirements — every plan declares its requirements and every Phase 45 requirement is mapped.

### Anti-Patterns Found

None. Grep for TODO/FIXME/PLACEHOLDER/XXX/HACK in server routes and client components returned zero matches. No empty-return handlers or console-log-only implementations detected.

### Human Verification Required

1. **Services page UI renders** — Visit https://gsd-dashboard-production.up.railway.app/services and confirm all 5 new sections render alongside existing Phase 40 status cards. No console errors. Skeleton placeholders transition to real data.

2. **Manual cost entry flow** — Click Add Cost → service=Railway, amount=12.50, recurring=false → Save. Row should appear immediately in CostsTable under Railway; project rollup updates; Delete button removes both `external_service_costs` and `manual_cost_entries` rows (verify via `curl /api/services/costs`).

3. **Recurring materialization** — Add a recurring entry with start_date in past. Reload page. Entry should appear exactly once for current month and NOT duplicate on subsequent reloads.

4. **Credentials flow** — Set a credential via Credentials Panel. Row shows `•••• (saved ...)`. Reload preserves it. Browser devtools network tab shows GET /api/app-settings returns no `value` field (metadata only).

5. **Webhook end-to-end** — Add mapping rule `sender=railway.app → project=gsddashboard`. POST `server/__tests__/fixtures/emails/railway.json` to `/api/webhooks/email`. Cost row should appear in UI with source=email, project_key=gsddashboard. Second POST returns `{status:'duplicate'}`.

6. **Needs Review flow** — POST a garbled-body fixture → row appears in Needs Review section → Save (promote) moves it to main table; Dismiss removes it via uniform DELETE.

### Gaps Summary

No automated gaps. All backend endpoints exist, are substantive, and are fully wired. All client components exist, are substantive, and call the correct API namespaces. Live Railway endpoints return 200 with valid envelope shapes, and persistent credential storage is empirically confirmed (railway_pat survived the Phase 45 deploy). The only outstanding items are UI click-through tests that the user explicitly skipped during execution — those are flagged under `human_verification` in the frontmatter.

The implementation matches the phase goal: backend-complete foundation for services cost tracking, encrypted credential storage ready for Phase 46 API integrations, email ingestion pipeline with Claude Haiku parsing and fail-safe unparsed-row capture, and a UI that is wired end-to-end and deployed to the live Railway URL.

---

_Verified: 2026-04-10_
_Verifier: Claude (gsd-verifier)_
