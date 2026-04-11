# Phase 45: Services Cost Tracking Foundation - Research

**Researched:** 2026-04-10
**Domain:** Email receipt ingestion, credential encryption at rest, CRUD cost UI
**Confidence:** HIGH (email parsing, encryption), MEDIUM (per-vendor receipt formats)

## Summary

Phase 45 delivers three loosely-coupled capabilities that all land data into the existing `external_service_costs` SQLite table (created in Phase 24, currently empty and unused):

1. **Email receipt parser** — forwarded billing emails from Railway / OpenAI / Vercel / Anthropic are ingested via an IMAP-polled mailbox, parsed with `mailparser.simpleParser()`, and inserted as normalized cost rows.
2. **Manual cost entry UI** — a `ServicesCostPanel` React component built on existing shadcn/ui primitives, writing through a new `/api/services/costs` CRUD route.
3. **Encrypted credentials storage** — a new `app_settings` SQLite table holding AES-256-GCM-encrypted blobs (Railway PAT, OpenAI admin key, Vercel token). Key derivation uses an env-var master secret (`DASHBOARD_SECRET_KEY`) that exists on the trusted local machine only — Railway's ephemeral container never sees it because SQLite + credentials live on the local box behind the ngrok proxy.

**Primary recommendation:** Use `imapflow` + `mailparser` for ingestion (poll every 5 min against a dedicated Gmail alias, e.g. `+gsd-billing`), per-vendor regex templates with a single generic fallback, and Node's built-in `crypto.createCipheriv('aes-256-gcm')` wrapped in a tiny `server/crypto.js` helper. Do not bring in SQLCipher — field-level encryption is simpler, avoids a native-build landmine on Railway, and leaves the rest of the DB queryable for debugging.

---

## User Constraints

No CONTEXT.md exists for Phase 45. The researcher used ROADMAP + REQUIREMENTS as the scoping source:

**Implied constraints (from REQUIREMENTS.md + STATE.md decisions):**
- Credentials MUST live in SQLite settings table, not env vars (roadmap decision, must survive Railway redeploys — but note: SQLite file lives on the trusted local machine, not Railway itself)
- Must extend (not replace) the existing `external_service_costs` table from Phase 24
- Email parser is described as "extending existing YNAB parser pattern" but NO YNAB parser currently exists in the codebase — this is aspirational framing; Phase 45 is building the FIRST email ingestion pipeline
- Must be compatible with backend-node rules: prepared statements, backward-compatible routes, non-blocking ingestion

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SVC-02 | Email billing parser extracts amount/date/service into `external_service_costs` | `imapflow` IMAP client + `mailparser.simpleParser()` for MIME decode; per-vendor regex templates; deterministic dedup via `message-id` + service+period composite key |
| SVC-06 | Manual cost entry fallback for services without API/email | shadcn `<Dialog>` + `<Form>` + `<Input>` pattern; reuse existing CRUD shape from `routes/pricing.js` upsert path |
| SVC-07 | Services page displays monthly total + per-project rollup | Existing `ServicesPage.tsx` from Phase 40 — add a costs column; join `external_service_costs` with `gsd-projects.json` service-to-project mapping |
| SVC-08 | API credentials stored in SQLite settings table, not env vars | New `app_settings` table; AES-256-GCM field encryption with master key from `DASHBOARD_SECRET_KEY` env; stored as `ciphertext \| iv \| tag` hex tuple in a single JSON-encoded column |

---

## Standard Stack

### Core (new deps for Phase 45)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `imapflow` | ^1.0.189 | Promise-based IMAP client | Modern successor to `node-imap`; built for EmailEngine; TLS + IDLE + mailbox locking out of the box |
| `mailparser` | ^3.7.0 | MIME decoding (headers, text, HTML, attachments) | Part of the Nodemailer ecosystem; `simpleParser()` returns a single object — exactly what receipt parsing needs |

### Core (already in the project — reuse, do not re-install)

| Library | Version | Purpose |
|---------|---------|---------|
| `better-sqlite3` | ^11.7.0 | Prepared-statement DB access (already in use throughout `server/db.js`) |
| `express` | ^4.21.2 | Route layer |
| `node:crypto` | built-in | AES-256-GCM field encryption — zero new deps |

### Client (already installed)

| Library | Purpose |
|---------|---------|
| shadcn `<Dialog>`, `<Form>`, `<Input>`, `<Button>`, `<Table>`, `<Skeleton>` | CRUD UI |
| `lucide-react` | Icons (DollarSign, Mail, Key) |
| Existing `api.ts` fetch helper | Server calls |

### Alternatives Considered

| Instead of | Could Use | Why we rejected |
|------------|-----------|-----------------|
| `imapflow` + `mailparser` | Cloudflare Email Workers → webhook POST | Requires domain on Cloudflare DNS + ngrok endpoint stability + extra moving part. IMAP poll is simpler for a single-user dashboard. |
| `imapflow` + `mailparser` | SendGrid/Postmark/Mailgun Inbound Parse | Third-party dependency, signup friction, monthly minimums. IMAP poll uses existing Gmail at $0. |
| `postal-mime` | `mailparser` | `postal-mime` targets browsers/workers; `mailparser` is the blessed Node choice and streams for big messages if ever needed |
| Field-level AES-GCM | `better-sqlite3-multiple-ciphers` (SQLCipher) | Whole-DB encryption forces a native rebuild, breaks the existing `better-sqlite3` binary on Railway, and encrypts data we don't need to encrypt. Field-level is ~30 LOC and leaves the DB debuggable. |
| Per-vendor regex templates | LLM-assisted extraction (GPT-4/Claude) | LLMs are slow, non-deterministic, cost money per email, and overkill for 4 known sender formats. Regex-per-template is ~20 LOC per vendor and trivially testable. |
| Env var `DASHBOARD_SECRET_KEY` for master key | In-DB "key-of-keys" encrypted with Railway env secret | Same trust boundary either way — if the attacker reads the SQLite file, they're already on the local machine. Env var is simplest. |

### Installation

```bash
npm install imapflow mailparser
```

Zero additions to `package.json.optionalDependencies`; both are pure-JS with no native builds.

---

## Architecture Patterns

### Recommended File Layout

```
server/
├── services/
│   ├── email-ingest.js          # IMAP poll loop + simpleParser orchestration
│   ├── receipt-parsers/
│   │   ├── index.js             # dispatcher: picks parser by From: header
│   │   ├── railway.js           # regex extraction for Railway receipts
│   │   ├── openai.js            # regex extraction for OpenAI receipts
│   │   ├── vercel.js            # regex extraction for Vercel receipts
│   │   ├── anthropic.js         # regex extraction for Anthropic receipts
│   │   └── generic.js           # fallback: any $X.XX near "total" in body
│   └── cost-dedup.js            # message-id based dedupe against DB
├── crypto.js                    # AES-256-GCM helpers (encryptField/decryptField)
└── routes/
    ├── services.js              # EXISTING — extend with /costs CRUD
    └── app-settings.js          # NEW — credential read/write (encrypted)
```

### Pattern 1: IMAP Poll Loop (non-blocking, fail-safe)

**What:** Poll the inbox every N minutes (default 5), fetch `UNSEEN` messages, parse, insert, mark `\Seen`.
**When to use:** Whenever the server boots AND there's a configured IMAP credential in `app_settings`. Start the loop in `server/index.js` after DB init, guarded so it no-ops if no credential is set.
**Key discipline:** Wrap the whole tick in `try/catch`; never let an IMAP error crash the Express process. Use `setTimeout` (not `setInterval`) with recursive scheduling, mirroring the Phase 43 project-status poller.

```javascript
// Source: imapflow docs — https://imapflow.com/
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function pollOnce() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: creds.email, pass: creds.appPassword },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    for await (const msg of client.fetch({ seen: false }, { source: true, envelope: true })) {
      const parsed = await simpleParser(msg.source);
      const row = dispatchParser(parsed); // { service, amount_usd, cost_period, checked_at, message_id }
      if (row && !alreadyIngested(row.message_id)) {
        insertCost(row);
      }
      await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

function scheduleNextPoll() {
  setTimeout(async () => {
    try { await pollOnce(); } catch (e) { console.error('[email-ingest]', e.message); }
    scheduleNextPoll();
  }, 5 * 60 * 1000);
}
```

### Pattern 2: Per-Vendor Regex Dispatcher

**What:** One small parser per sender. The dispatcher picks the right one by matching `parsed.from.value[0].address` against a static map. Fallback to `generic.js` when no match.

```javascript
// server/services/receipt-parsers/index.js
const parsers = {
  'team@railway.app':          require('./railway'),
  'receipts@openai.com':       require('./openai'),
  'invoice+statements@vercel.com': require('./vercel'),
  'noreply@anthropic.com':     require('./anthropic'),
};

function dispatchParser(parsedEmail) {
  const from = parsedEmail.from?.value?.[0]?.address?.toLowerCase() || '';
  const parser = parsers[from] || require('./generic');
  return parser.extract(parsedEmail); // returns null if unparseable
}
```

Each vendor parser returns the normalized shape:

```javascript
{
  service: 'railway',           // enum: railway|openai|vercel|anthropic|other
  amount_usd: 12.34,            // REAL
  cost_period: 'monthly',       // enum: monthly|usage
  checked_at: '2026-04-10T...', // ISO from email's Date: header
  message_id: '<abc@mail>',     // for dedup
  raw_subject: 'Invoice #123',  // debugging
}
```

### Pattern 3: Field-Level Encryption for Credentials

**What:** Store each secret as `{ciphertext, iv, tag}` JSON. The encryption key is derived from `process.env.DASHBOARD_SECRET_KEY` via SHA-256 (stretches any-length input to exactly 32 bytes).

**When to use:** Any write to `app_settings` where `is_secret = 1`.

```javascript
// server/crypto.js
const crypto = require('crypto');

function getKey() {
  const raw = process.env.DASHBOARD_SECRET_KEY;
  if (!raw) throw new Error('DASHBOARD_SECRET_KEY not set — cannot encrypt credentials');
  return crypto.createHash('sha256').update(raw).digest(); // 32 bytes
}

function encryptField(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    ct: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  });
}

function decryptField(blob) {
  const { ct, iv, tag } = JSON.parse(blob);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encryptField, decryptField };
```

### Pattern 4: New `app_settings` Table (Schema)

Add to `server/db.js` migration block (same pattern as Phase 24 and Phase 42):

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,           -- either plaintext OR encrypted JSON blob
  is_secret INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

Also extend `external_service_costs` (currently only has `id, service, cost_period, cost_usd, checked_at`) with:

```sql
ALTER TABLE external_service_costs ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
  -- enum: 'manual' | 'email' | 'api' (API is Phase 46)
ALTER TABLE external_service_costs ADD COLUMN message_id TEXT;
  -- null for manual/api rows; populated for email rows (dedup key)
ALTER TABLE external_service_costs ADD COLUMN project_key TEXT;
  -- optional rollup key matching gsd-projects.json entries; null = global
ALTER TABLE external_service_costs ADD COLUMN notes TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_costs_msgid
  ON external_service_costs(message_id) WHERE message_id IS NOT NULL;
```

Wrapped in the same `try { SELECT ... } catch { ALTER ... }` migration idiom already used in `server/db.js`.

### Anti-Patterns to Avoid

- **Hand-rolling MIME parsing.** Multipart boundaries, quoted-printable, base64, forwarding chains, non-ASCII subjects — `mailparser` handles all of it. Do not touch raw `msg.source`.
- **Parsing HTML with regex.** Use `parsed.text` (the plaintext view mailparser already extracts). If a vendor sends HTML-only, call `require('html-to-text').convert()` — OR just regex the HTML since vendor templates are stable. Prefer the former.
- **Storing secrets in plaintext "temporarily".** Once the route exists users will paste real PATs immediately; any plaintext write is a leaked credential.
- **Blocking the Express event loop on IMAP.** Poll loop must be a separate async task; routes must never `await pollOnce()` synchronously.
- **Putting the IMAP password in env vars.** It's a credential like any other — store it encrypted in `app_settings` via the same mechanism as Railway PAT et al. Otherwise SVC-08 is undermined.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MIME decoding (multipart, quoted-printable, base64, charsets) | Custom parser | `mailparser` | Decades of email-format insanity — forwarding chains, =?UTF-8?B?...?= subject lines, nested multiparts |
| IMAP protocol (AUTH, FETCH, STORE, IDLE, UID tracking) | Raw socket | `imapflow` | TLS handshake, command pipelining, mailbox locking, flag races |
| HTML → text extraction | DOM walker | `parsed.text` from mailparser (pre-extracted) OR `html-to-text` | mailparser already does this for you |
| AES cipher suite selection | Hand-picked | Node's `crypto.createCipheriv('aes-256-gcm', ...)` | Built-in, audited, GCM provides both confidentiality and authentication (detects tampering) |
| Random IV generation | `Math.random()` or hash | `crypto.randomBytes(12)` | GCM REQUIRES unique IVs per (key, message); non-CSPRNG here is a key-recovery attack |
| Date parsing from email headers | Regex | `parsed.date` (mailparser already returns a JS `Date` from the `Date:` header) | RFC 2822 date format is nasty with timezones |
| Currency parsing ($1,234.56 / 1.234,56 €) | Regex | Stay in USD, vendors invoice in USD for these services, extract `\$([\d,]+\.\d{2})` and `parseFloat(m[1].replace(/,/g,''))` | True i18n currency parsing is `Intl.NumberFormat` reverse-engineering — not worth it; vendors are all USD |
| Deduplication across poll cycles | Hash of full body | `Message-ID` header (RFC-guaranteed unique) | mailparser exposes as `parsed.messageId` |

**Key insight:** Every single item above has bitten someone into rewriting the whole ingestion pipeline. The regex-per-vendor approach works because we control the sender list (~4 vendors) — it would be a disaster for general-purpose email, but for this narrow use case it's more reliable and debuggable than an LLM extractor.

---

## Common Pitfalls

### Pitfall 1: Forwarded emails hide the original From: header

**What goes wrong:** User clicks "Forward" in Gmail to send a Railway receipt to the GSD inbox. The resulting email's `From:` is now the user, not `team@railway.app`. Dispatcher falls through to `generic.js` and may misclassify service.
**Why it happens:** MUA forwarding rewrites the envelope.
**How to avoid:** In each vendor parser, ALSO check `parsed.subject` and the first few lines of body for service signatures (`"Railway"`, `"OpenAI usage"`, etc.). Dispatcher should try: (1) original `From:`, (2) `Return-Path:`, (3) `X-Forwarded-For`, (4) body-text heuristics, in that order.
**Warning signs:** Early rows have `service='other'` — add a `raw_subject` column (already proposed above) to debug.

### Pitfall 2: Gmail IMAP "UNSEEN" races with the Gmail web UI

**What goes wrong:** User reads the receipt in Gmail web before the poller picks it up. IMAP returns it as `\Seen` and the filter skips it forever.
**Why it happens:** Gmail applies `\Seen` instantly on web open.
**How to avoid:** Use a dedicated label (`gsd-billing`) — have the user set up a Gmail filter that labels incoming receipts and moves them OUT of INBOX. Poll the `gsd-billing` label with `{ seen: false }` first, then after a successful ingest, move to `gsd-billing/processed`. Alternatively, rely on `message_id` dedup and fetch ALL messages in the label on every tick — slower but bulletproof.
**Warning signs:** Missing rows in DB, messages visible in Gmail but not in dashboard.

### Pitfall 3: Same email polled twice = duplicate cost row

**What goes wrong:** Poller crashes after insert but before `messageFlagsAdd`. Next tick re-fetches and inserts again.
**Why it happens:** No transactional boundary between DB and IMAP flag.
**How to avoid:** `UNIQUE INDEX ON external_service_costs(message_id) WHERE message_id IS NOT NULL` (already in proposed schema). Use `INSERT OR IGNORE` — SQLite silently drops dupes. Also: flag the IMAP message as `\Seen` BEFORE the DB insert (idempotent DB, non-idempotent IMAP is cheaper to re-seen than to re-insert).

### Pitfall 4: `DASHBOARD_SECRET_KEY` lost/rotated = unrecoverable credentials

**What goes wrong:** User rotates or loses the env secret. Existing rows in `app_settings` become permanently undecryptable.
**Why it happens:** GCM with a new key cannot decrypt ciphertext from the old key — and there's no recovery.
**How to avoid:**
  1. On boot, if `DASHBOARD_SECRET_KEY` is missing, log a LOUD warning and refuse to decrypt (don't crash the process — the rest of the dashboard still works).
  2. Store a sentinel row `key='__key_check__', value=encrypt('ok')` — on boot, attempt to decrypt; if it fails, surface "secret key mismatch" on the settings page with instructions.
  3. Document the env var in README / SETUP.
**Warning signs:** Settings page shows "could not decrypt credentials" on load.

### Pitfall 5: HTML-only receipt emails

**What goes wrong:** `parsed.text` is empty because the vendor sends HTML-only. Regex against empty string returns nothing.
**Why it happens:** Some receipt emails (Vercel in particular) are HTML-dominant; mailparser extracts text when a text/plain part exists, but not when it doesn't.
**How to avoid:** Fallback: if `parsed.text` is empty, use `parsed.html` and strip tags with a trivial `replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')`. Or use `html-to-text` (~60KB, worth the dep if any vendor regex fails).
**Warning signs:** `generic.js` fallback hits, or a specific vendor parser never matches.

### Pitfall 6: `parsed.from.value` is not always an array

**What goes wrong:** Crashes on `parsed.from.value[0].address` when `.value` is undefined (malformed headers).
**Why it happens:** mailparser returns `undefined` / missing props on broken emails.
**How to avoid:** Always `parsed.from?.value?.[0]?.address?.toLowerCase() || ''` — the same optional-chain discipline already used in `server/routes/services.js`.

---

## Code Examples

### Example 1: Railway vendor parser (representative)

```javascript
// server/services/receipt-parsers/railway.js
// Source pattern: typical Railway monthly-usage receipt
function extract(parsed) {
  const text = parsed.text || parsed.html?.replace(/<[^>]+>/g, ' ') || '';
  const subject = parsed.subject || '';

  // Amount: look for "$12.34" near the word "total" or "charged"
  const amountMatch = text.match(/(?:total|charged|amount)[^\n$]{0,40}\$([\d,]+\.\d{2})/i);
  if (!amountMatch) return null;
  const amount_usd = parseFloat(amountMatch[1].replace(/,/g, ''));

  return {
    service: 'railway',
    amount_usd,
    cost_period: 'monthly',
    checked_at: (parsed.date || new Date()).toISOString(),
    message_id: parsed.messageId || null,
    raw_subject: subject,
    source: 'email',
  };
}

module.exports = { extract };
```

### Example 2: IMAP credential round-trip through encryption

```javascript
// server/routes/app-settings.js
const { encryptField, decryptField } = require('../crypto');
const { db } = require('../db');

const upsert = db.prepare(`
  INSERT INTO app_settings (key, value, is_secret, updated_at)
  VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    is_secret = excluded.is_secret,
    updated_at = excluded.updated_at
`);
const select = db.prepare('SELECT * FROM app_settings WHERE key = ?');

router.put('/api/app-settings/:key', express.json(), (req, res) => {
  const { value, is_secret } = req.body;
  if (typeof value !== 'string') return res.status(400).json({ error: 'value required' });
  const stored = is_secret ? encryptField(value) : value;
  upsert.run(req.params.key, stored, is_secret ? 1 : 0);
  res.json({ ok: true });
});

router.get('/api/app-settings/:key', (req, res) => {
  const row = select.get(req.params.key);
  if (!row) return res.status(404).json({ error: 'not set' });
  // NEVER return plaintext secrets — return a redacted marker only
  if (row.is_secret) {
    return res.json({ key: row.key, is_secret: true, set: true, updated_at: row.updated_at });
  }
  res.json({ key: row.key, value: row.value, is_secret: false, updated_at: row.updated_at });
});

// Internal helper for the IMAP poller + future API integrations
function getSecret(key) {
  const row = select.get(key);
  if (!row || !row.is_secret) return null;
  try { return decryptField(row.value); } catch { return null; }
}
module.exports = { router, getSecret };
```

### Example 3: Manual cost CRUD route

```javascript
// server/routes/services.js — ADD to existing file
const costStmts = {
  list: db.prepare(`
    SELECT id, service, cost_period, cost_usd, checked_at, source, project_key, notes
    FROM external_service_costs ORDER BY checked_at DESC
  `),
  insert: db.prepare(`
    INSERT INTO external_service_costs
      (id, service, cost_period, cost_usd, checked_at, source, project_key, notes)
    VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)
  `),
  update: db.prepare(`
    UPDATE external_service_costs SET
      service = ?, cost_period = ?, cost_usd = ?, project_key = ?, notes = ?
    WHERE id = ? AND source = 'manual'
  `),
  delete: db.prepare(`DELETE FROM external_service_costs WHERE id = ? AND source = 'manual'`),
};

router.get('/costs', (_req, res) => res.json({ costs: costStmts.list.all() }));
router.post('/costs', express.json(), (req, res) => {
  const { service, cost_period = 'monthly', cost_usd, project_key = null, notes = null } = req.body;
  if (!service || typeof cost_usd !== 'number') return res.status(400).json({ error: 'service+cost_usd required' });
  const id = require('uuid').v4();
  costStmts.insert.run(id, service, cost_period, cost_usd, new Date().toISOString(), project_key, notes);
  res.json({ ok: true, id });
});
```

Note: update/delete paths restrict to `source='manual'` so email-ingested rows can't be mutated through the UI accidentally.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-imap` (callback-based) | `imapflow` (Promise-based) | 2020+ | Modern async/await, far fewer footguns |
| Regex MIME parsing | `mailparser.simpleParser()` | Stable since ~2017 | Zero reason to hand-roll |
| AES-256-CBC + HMAC-SHA256 | AES-256-GCM (AEAD) | Standard since ~2015 | Single primitive, built-in tamper detection |
| Whole-DB SQLCipher | Field-level encryption for secrets only | This project | Keeps debugging easy, avoids native rebuild on Railway |

**Deprecated/outdated:**
- `mailparser` versions < 3.x had a different streaming API — use v3 `simpleParser` (single-shot) for receipts
- `node-imap` is still maintained but its callback style is a liability — avoid
- `crypto.createCipher` (no `iv`) — deprecated in Node 10, hard-removed in Node 22. Always use `createCipheriv`.

---

## Open Questions

1. **Where does the IMAP inbox actually live?**
   - What we know: user needs a mailbox to forward receipts to
   - What's unclear: Gmail alias (`user+gsd-billing@gmail.com`) vs dedicated account vs Fastmail vs self-hosted
   - Recommendation: Default to Gmail with an app password. Document setup in SETUP.md: (1) create app password at myaccount.google.com/apppasswords, (2) create a label `gsd-billing`, (3) create a filter that moves `from:(railway.app OR openai.com OR vercel.com OR anthropic.com)` to that label. Store email + app-password in the encrypted `app_settings` table.

2. **Per-project attribution of costs**
   - What we know: SVC-07 wants "per-project rollup"
   - What's unclear: How to map a Railway bill to gsddashboard vs debates vs taskhub — Railway bills are per-project on Railway's side but the emails may be per-account
   - Recommendation: Add `project_key` column on `external_service_costs` (already in proposed schema). For email rows, default `project_key = null` (unassigned). The Services page shows an "Unassigned costs" bucket with an inline dropdown to pin each row to a project. Full per-project Railway attribution comes later via the Railway GraphQL integration (Phase 46).

3. **Exact receipt email format per vendor — untested**
   - What we know: Regex approach works IF the vendor uses stable templates
   - What's unclear: We can't actually see Railway/OpenAI/Vercel/Anthropic receipt bodies without real sample emails
   - Recommendation: Make `generic.js` fallback log the full parsed body to `events` table with `event_type='email_receipt_unparsed'` — first N real receipts become the regex corpus. Accept that the initial vendor parsers will need tuning after first contact with real data.

4. **Should IMAP poller run in proxy mode (Railway container)?**
   - What we know: Railway deployment is a proxy to the local machine; SQLite lives on the local box
   - What's unclear: Should the Railway container run the poller OR should the local-machine backend run it?
   - Recommendation: Local machine only (same place as SQLite + `DASHBOARD_SECRET_KEY`). Gate the poller startup on `!process.env.GSD_DATA_URL` (proxy mode disables the poller), mirroring the Phase 43 poller pattern.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node 22 built-in `node:test` (see `npm run test:server` in package.json) |
| Config file | None — plain `node --test server/__tests__/*.test.js` |
| Quick run command | `npm run test:server` |
| Full suite command | `npm run test:server && npm run test:client` |

Existing fixtures live in `server/__tests__/` — follow that layout.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SVC-02 | `railway.js` parser extracts amount+date+service from sample email | unit | `node --test server/__tests__/receipt-parser-railway.test.js` | ❌ Wave 0 |
| SVC-02 | `openai.js` parser extracts from sample email | unit | `node --test server/__tests__/receipt-parser-openai.test.js` | ❌ Wave 0 |
| SVC-02 | `vercel.js` parser extracts from sample email | unit | `node --test server/__tests__/receipt-parser-vercel.test.js` | ❌ Wave 0 |
| SVC-02 | `anthropic.js` parser extracts from sample email | unit | `node --test server/__tests__/receipt-parser-anthropic.test.js` | ❌ Wave 0 |
| SVC-02 | Dispatcher falls back to `generic.js` on unknown sender | unit | `node --test server/__tests__/receipt-dispatcher.test.js` | ❌ Wave 0 |
| SVC-02 | Duplicate `message_id` does not produce a duplicate row | integration | `node --test server/__tests__/cost-dedup.test.js` | ❌ Wave 0 |
| SVC-06 | POST `/api/services/costs` inserts a manual row | integration | `node --test server/__tests__/services-costs-route.test.js` | ❌ Wave 0 |
| SVC-06 | PUT/DELETE restricted to `source='manual'` rows | integration | same file as above | ❌ Wave 0 |
| SVC-07 | GET `/api/services/costs` returns rollup with `project_key` | integration | same file as above | ❌ Wave 0 |
| SVC-07 | ServicesPage renders costs column (smoke) | manual-only | "Load /services on dev server, verify cost column appears with skeleton → data" | N/A |
| SVC-08 | `encryptField` / `decryptField` round-trip preserves value | unit | `node --test server/__tests__/crypto.test.js` | ❌ Wave 0 |
| SVC-08 | Wrong `DASHBOARD_SECRET_KEY` causes `decryptField` to throw | unit | same file as above | ❌ Wave 0 |
| SVC-08 | GET `/api/app-settings/:key` NEVER returns plaintext for `is_secret=1` | integration | `node --test server/__tests__/app-settings-route.test.js` | ❌ Wave 0 |
| SVC-08 | Round-trip: PUT secret → getSecret() returns original plaintext | integration | same file as above | ❌ Wave 0 |

The single manual-only test (ServicesPage render) is justified because the existing ServicesPage test infra is client-side only and visual smoke is faster than wiring a React test runner for a display change.

### Sampling Rate

- **Per task commit:** `npm run test:server` (runs in < 10s on this project)
- **Per wave merge:** `npm run test:server && npm run test:client`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `server/__tests__/receipt-parser-railway.test.js` — covers SVC-02 (Railway)
- [ ] `server/__tests__/receipt-parser-openai.test.js` — covers SVC-02 (OpenAI)
- [ ] `server/__tests__/receipt-parser-vercel.test.js` — covers SVC-02 (Vercel)
- [ ] `server/__tests__/receipt-parser-anthropic.test.js` — covers SVC-02 (Anthropic)
- [ ] `server/__tests__/receipt-dispatcher.test.js` — covers SVC-02 (dispatcher + generic fallback)
- [ ] `server/__tests__/cost-dedup.test.js` — covers SVC-02 (dedup)
- [ ] `server/__tests__/services-costs-route.test.js` — covers SVC-06, SVC-07
- [ ] `server/__tests__/crypto.test.js` — covers SVC-08 (crypto helpers)
- [ ] `server/__tests__/app-settings-route.test.js` — covers SVC-08 (route + redaction)
- [ ] `server/__tests__/fixtures/emails/` — directory of raw `.eml` samples (one per vendor) for parser tests
- [ ] No framework install needed — `node:test` is built in and `npm run test:server` already works

Each parser test loads a raw `.eml` from `fixtures/emails/`, runs `simpleParser` + the vendor extractor, asserts the normalized shape. Fixtures can start as synthetic (copy/paste a realistic email body) and be replaced with real samples after first contact with production receipts.

---

## Sources

### Primary (HIGH confidence)
- [imapflow docs](https://imapflow.com/) — official API reference, polling + flag management patterns
- [mailparser (Nodemailer)](https://nodemailer.com/extras/mailparser) — official `simpleParser` contract, HTML/text extraction behavior
- [Node.js crypto module](https://nodejs.org/api/crypto.html) — `createCipheriv`, GCM tag handling (built-in, cutoff-safe)
- Existing repo code: `server/db.js` (migration idiom), `server/routes/services.js` (Phase 40 baseline), `server/routes/pricing.js` (CRUD pattern), `server/__tests__/` (test layout)

### Secondary (MEDIUM confidence)
- [postal-mime README](https://github.com/postalsys/postal-mime) — cross-checked as alternative, confirmed mailparser is blessed for Node
- [better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers) — cross-checked SQLCipher path, rejected due to native build risk
- [OneUptime SQLCipher post (2026-02)](https://oneuptime.com/blog/post/2026-02-02-sqlcipher-encryption/view) — confirms SQLCipher as standard whole-DB option but overkill here
- [Cloudflare Email Workers docs](https://developers.cloudflare.com/email-routing/email-workers/) — cross-checked webhook alternative, rejected due to operational complexity

### Tertiary (LOW confidence)
- Per-vendor receipt email exact formats (Railway, OpenAI, Vercel, Anthropic) — no public templates available; regex patterns must be tuned against real production samples after deployment (documented in Open Question 3)

---

## Metadata

**Confidence breakdown:**
- Standard stack (imapflow + mailparser + node:crypto): HIGH — all blessed, battle-tested, Node-native
- Architecture patterns (poll loop, dispatcher, field encryption): HIGH — follows existing repo idioms (Phase 24, Phase 42, Phase 43)
- Don't hand-roll list: HIGH — every item has well-known failure modes
- Pitfalls: HIGH for general ones, MEDIUM for Gmail-specific quirks
- Per-vendor regex templates: MEDIUM — pattern approach is sound, exact regexes will need real-sample tuning
- Encryption-at-rest recommendation: HIGH for the trust model (local-machine SQLite, master-key-in-env) — cross-verified against multiple sources

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (30 days — stable ecosystem, no fast-moving libraries in stack)
