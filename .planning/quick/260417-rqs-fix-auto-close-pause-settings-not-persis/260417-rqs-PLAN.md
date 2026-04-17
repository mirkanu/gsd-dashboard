---
phase: 260417-rqs-fix-auto-close-pause-settings-not-persis
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/routes/app-settings.js
  - client/src/lib/api.ts
  - client/src/pages/ConfigPage.tsx
  - server/gsd/idleDetector.js
autonomous: false
requirements:
  - QT-260417-rqs
must_haves:
  truths:
    - "ConfigPage Idle Auto-Close section loads the current persisted threshold, enabled flag, and RAM rate from the server on mount (not hardcoded defaults)"
    - "After saving a non-default threshold (e.g. 45 min) the value survives a full page reload"
    - "After toggling auto-close off and reloading, the toggle still shows off"
    - "idleDetector.getIdleThresholdMs() successfully reads and decrypts idle_timeout_minutes without falling back to the 120-min default due to a require() resolution error"
  artifacts:
    - path: "server/routes/app-settings.js"
      provides: "GET /api/app-settings/:key/value plaintext-read endpoint, restricted to a PUBLIC_SETTINGS allow-list (idle_timeout_minutes, railway_ram_rate_monthly)"
    - path: "client/src/lib/api.ts"
      provides: "api.appSettings.getValue(key) wrapper around the new plaintext-read endpoint"
    - path: "client/src/pages/ConfigPage.tsx"
      provides: "useEffect on mount fetches both settings via api.appSettings.getValue and hydrates idleThresholdMinutes / idleEnabled / ramRate state"
    - path: "server/gsd/idleDetector.js"
      provides: "Correct require path for crypto.getSecret (server/crypto.js, not ./crypto which resolves to server/gsd/crypto.js and fails)"
  key_links:
    - from: "client/src/pages/ConfigPage.tsx"
      to: "/api/app-settings/:key/value"
      via: "api.appSettings.getValue() in a useEffect([])"
      pattern: "api\\.appSettings\\.getValue"
    - from: "server/routes/app-settings.js"
      to: "crypto.getSecret"
      via: "GET /:key/value handler, gated by PUBLIC_SETTINGS allow-list"
      pattern: "PUBLIC_SETTINGS\\.includes"
    - from: "server/gsd/idleDetector.js"
      to: "server/crypto.js getSecret()"
      via: "require('../crypto').getSecret"
      pattern: "require\\('\\.\\./crypto'\\)"
---

<objective>
Fix the auto-close / pause-work settings persistence bug. The UI shows "Saved" but on reload the settings snap back to the hardcoded defaults (120 min, on, $10/GB-month).

**Root cause (investigated):**

1. **Primary bug — ConfigPage never reads back what it saved.** `client/src/pages/ConfigPage.tsx` lines 118-120 initialize `idleThresholdMinutes`, `ramRate`, and `idleEnabled` from hardcoded defaults and there is no fetch-on-mount for them. The only app-settings endpoint the client currently has (`api.appSettings.list()` / `.get()`) returns metadata only — no plaintext — by design because the encrypted `app_settings` table is meant for secrets like Railway PAT. The save path (PUT /api/app-settings/:key) does persist correctly to SQLite (confirmed by tracing through `server/crypto.js#setSecret`), but the client has no way to read the value back, so every mount shows the defaults. `.planning/phases/48-idle-session-cost-controls/48-04-SUMMARY.md` line 94 even documents this as a known limitation ("ConfigPage initializes idle settings from hardcoded defaults (120 min, $10/GB-month) since GET app-settings returns no plaintext") — it shipped as a bug dressed up as a design decision.

2. **Secondary latent bug — idleDetector can never read the saved threshold.** `server/gsd/idleDetector.js` line 19 does `const { decrypt } = require('./crypto')` which resolves relative to `server/gsd/` and looks for `server/gsd/crypto.js` — a file that does not exist (confirmed: `node -e "require('./server/gsd/crypto')"` throws `Cannot find module`). The correct path is `../crypto` (i.e. `server/crypto.js`). The surrounding try/catch swallows the `MODULE_NOT_FOUND` error silently and always returns `DEFAULT_IDLE_THRESHOLD_MS` (120 min). So even if the UI persisted the value correctly, the idle detector would still use 120 min. This is a real bug the fix must close.

**Fix strategy:** Add a narrow, allow-listed plaintext-read endpoint for the two non-secret operational settings (`idle_timeout_minutes`, `railway_ram_rate_monthly`). Hydrate ConfigPage from it on mount. Fix the crypto require path in idleDetector.

**Non-goals:** Do not break the secret-safety contract for other keys (railway_pat, openai_admin_key, vercel_token). Plaintext access is strictly allow-listed.

Purpose: Make the Idle Auto-Close section a correctly round-tripped settings surface.
Output: Working, persisted auto-close/pause settings across reloads.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/48-idle-session-cost-controls/48-04-SUMMARY.md
@.planning/phases/48-idle-session-cost-controls/48-VERIFICATION.md
@/data/home/gsddashboard/CLAUDE.md
@/data/home/gsddashboard/.claude/rules/backend-node.md
@/data/home/gsddashboard/.claude/rules/frontend-react.md

@server/routes/app-settings.js
@client/src/lib/api.ts
@client/src/pages/ConfigPage.tsx
@server/gsd/idleDetector.js
@server/crypto.js

<interfaces>
<!-- Key contracts and signatures the executor needs — extracted from codebase. -->

From server/crypto.js (exports):
```js
module.exports = { encryptField, decryptField, getSecret, setSecret, listSecretKeys };
// getSecret(key: string): string | null  (null on decrypt failure or missing)
```

From server/routes/app-settings.js (existing routes — do NOT change shapes of these):
```js
// GET  /api/app-settings            -> { keys: [{ key, updated_at, set: true }] }   (metadata only)
// GET  /api/app-settings/:key       -> { key, set: true, updated_at } | 404         (metadata only)
// PUT  /api/app-settings/:key       -> { ok: true }                                 (body: { value: string })
// DELETE /api/app-settings/:key     -> { ok: true }
```

From client/src/lib/api.ts (existing appSettings object — ADD to it, do not remove):
```ts
appSettings: {
  list: () => request<{ keys: SecretKey[] }>(`/app-settings`);
  get:  (key: string) => request<{ key: string; set: true; updated_at: string }>(`/app-settings/${encodeURIComponent(key)}`);
  set:  (key: string, value: string) => request<{ ok: true }>(`/app-settings/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value }) });
  delete: (key: string) => request<{ ok: true }>(`/app-settings/${encodeURIComponent(key)}`, { method: "DELETE" });
}
```

From client/src/pages/ConfigPage.tsx (state to hydrate on mount):
```ts
const [idleThresholdMinutes, setIdleThresholdMinutes] = useState<number>(120);   // line 118
const [ramRate, setRamRate] = useState<number>(10.0);                            // line 119
const [idleEnabled, setIdleEnabled] = useState<boolean>(true);                   // line 120
```

From server/gsd/idleDetector.js (broken require path, line 19):
```js
// BROKEN — resolves to server/gsd/crypto.js which does not exist:
const { decrypt } = require('./crypto');

// After fix, prefer the higher-level helper instead of hand-rolling decrypt:
const { getSecret } = require('../crypto');
const val = getSecret('idle_timeout_minutes');   // returns null on missing/decrypt-fail
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add allow-listed plaintext-read endpoint + client helper + fix idleDetector require</name>
  <files>server/routes/app-settings.js, client/src/lib/api.ts, server/gsd/idleDetector.js</files>
  <behavior>
    - GET /api/app-settings/:key/value returns { key, value: string } for keys in PUBLIC_SETTINGS allow-list (initially: ['idle_timeout_minutes', 'railway_ram_rate_monthly']).
    - Same endpoint returns 403 { error: 'not a public setting' } for any other key — secrets (railway_pat, openai_admin_key, vercel_token, etc.) must stay unreadable over the wire.
    - Returns 404 { error: 'not set' } when the key is in the allow-list but no row exists.
    - api.appSettings.getValue(key) client helper returns { key: string; value: string }.
    - server/gsd/idleDetector.js getIdleThresholdMs() no longer silently falls back to 120 due to a MODULE_NOT_FOUND on require('./crypto').
  </behavior>
  <action>
    **A) server/routes/app-settings.js — add plaintext-read endpoint.**

    1. Near the top of the file (after the existing `PHASE_48_DEFAULTS` block) add a constant:
       ```js
       // Keys whose plaintext value MAY be read over the wire. Secrets never appear here.
       const PUBLIC_SETTINGS = ['idle_timeout_minutes', 'railway_ram_rate_monthly'];
       ```
    2. Import `getSecret` from `../crypto` — currently only `setSecret, listSecretKeys` are imported. Update the require line to also pull `getSecret`.
    3. Register a new route — **place it BEFORE the existing `router.get('/:key', ...)` handler** so Express path matching hits the more specific `/:key/value` route first:
       ```js
       // GET /api/app-settings/:key/value — plaintext read, strictly allow-listed to non-secret settings.
       router.get('/:key/value', (req, res) => {
         const { key } = req.params;
         if (!PUBLIC_SETTINGS.includes(key)) {
           return res.status(403).json({ error: 'not a public setting' });
         }
         // Ensure defaults are seeded so first-read after cold-start succeeds.
         try { seedPhase48Defaults(); } catch (e) { /* non-fatal in test env */ }
         const value = getSecret(key);
         if (value == null) return res.status(404).json({ error: 'not set' });
         res.json({ key, value });
       });
       ```
    4. Do NOT change the shape or auth behavior of any existing route. Do NOT widen the allow-list beyond the two Phase 48 keys in this quick task.

    **B) client/src/lib/api.ts — add getValue helper.**

    Inside the existing `appSettings: { ... }` object (around line 254), add:
    ```ts
    getValue: (key: string) =>
      request<{ key: string; value: string }>(
        `/app-settings/${encodeURIComponent(key)}/value`
      ),
    ```
    Keep it next to `get`. Do not remove or reshape existing methods.

    **C) server/gsd/idleDetector.js — fix broken require path.**

    Replace the broken implementation of `getIdleThresholdMs()` (lines 16-29). The current body does a raw `db.prepare(...SELECT value_encrypted, iv, auth_tag...)` and tries `require('./crypto')` (which resolves to `server/gsd/crypto.js` — a file that does not exist). Switch to the higher-level helper:
    ```js
    function getIdleThresholdMs() {
      try {
        const { getSecret } = require('../crypto');
        const val = getSecret('idle_timeout_minutes');
        if (val == null) return DEFAULT_IDLE_THRESHOLD_MS;
        const mins = parseInt(val, 10);
        if (isNaN(mins)) return DEFAULT_IDLE_THRESHOLD_MS;
        return mins * 60 * 1000; // 0 means disabled
      } catch {
        return DEFAULT_IDLE_THRESHOLD_MS;
      }
    }
    ```
    This matches the pattern `server/gsd/costMeasurement.js` uses at line 113-114 for `railway_ram_rate_monthly` (deferred require of `../crypto`). Keep the `// 0 means disabled` comment — the semantics are preserved downstream in `_testCheckAndCloseSession`.

    **Notes / gotchas:**
    - Express routes: `router.get('/:key/value', ...)` must be registered before `router.get('/:key', ...)` to avoid the latter swallowing the request. Verify by grepping the final file.
    - Do not introduce any new dependency; `getSecret` already exists in `server/crypto.js` (lines 73-82).
    - The 403 response for non-allow-listed keys is non-negotiable — preserves the secret-safety contract.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -30</automated>
    Manual smoke (run after executor starts `npm run dev` or on live Railway):
    ```
    curl -s http://localhost:3009/api/app-settings/idle_timeout_minutes/value   # expect {"key":"idle_timeout_minutes","value":"120"}
    curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3009/api/app-settings/railway_pat/value   # expect 403
    ```
  </verify>
  <done>
    - New GET /:key/value route present, allow-listed, returns plaintext for idle_timeout_minutes and railway_ram_rate_monthly, 403 for any other key.
    - api.appSettings.getValue exists and is typed.
    - idleDetector.js uses require('../crypto').getSecret; no stale require('./crypto').
    - `npm run test:server` passes (or fails only for unrelated pre-existing failures — note any in the summary).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Hydrate ConfigPage Idle Auto-Close section from server on mount</name>
  <files>client/src/pages/ConfigPage.tsx</files>
  <behavior>
    - On ConfigPage mount, the three idle-related pieces of state (idleThresholdMinutes, ramRate, idleEnabled) are initialized from /api/app-settings/:key/value, not from hardcoded defaults.
    - If idle_timeout_minutes is "0" the toggle renders off and no threshold input is shown; idleThresholdMinutes retains the last non-zero value (or falls back to 120) so re-enabling does not lose it.
    - If idle_timeout_minutes is a positive integer the toggle renders on and the input shows that number.
    - railway_ram_rate_monthly hydrates the RAM rate input.
    - Hydration failure (network error, 404, 403) is non-fatal: the UI falls back to current defaults and does not crash; log via console.warn.
    - Saves continue to use api.appSettings.set(key, value) (existing code path, unchanged). After save, UI state already reflects what was saved — no second fetch needed.
  </behavior>
  <action>
    Modify `client/src/pages/ConfigPage.tsx` only. Do not touch other components.

    1. Add a new `useEffect` near the existing effect at lines 132-148 (project-list load). Place it immediately after that effect so the hook order stays stable. It runs once on mount (`[]` deps):
       ```tsx
       // Hydrate Idle Auto-Close settings from the server so reloads preserve them.
       useEffect(() => {
         let cancelled = false;
         (async () => {
           try {
             const [idleResp, ramResp] = await Promise.allSettled([
               api.appSettings.getValue('idle_timeout_minutes'),
               api.appSettings.getValue('railway_ram_rate_monthly'),
             ]);
             if (cancelled) return;
             if (idleResp.status === 'fulfilled') {
               const mins = parseInt(idleResp.value.value, 10);
               if (!isNaN(mins)) {
                 if (mins === 0) {
                   setIdleEnabled(false);
                   // Keep idleThresholdMinutes at default 120 so re-enabling has a sane value.
                 } else {
                   setIdleEnabled(true);
                   setIdleThresholdMinutes(mins);
                 }
               }
             }
             if (ramResp.status === 'fulfilled') {
               const rate = parseFloat(ramResp.value.value);
               if (!isNaN(rate)) setRamRate(rate);
             }
           } catch (e) {
             console.warn('Failed to hydrate idle settings', e);
           }
         })();
         return () => { cancelled = true; };
       }, []);
       ```
    2. Do NOT change the existing save helpers (`saveIdleSetting`, `handleIdleToggle`). They remain the source of truth for writes. Do NOT remove the hardcoded default values in `useState` — they serve as the fallback before hydration lands.
    3. Preserve the existing cancellation / no-op pattern used elsewhere in the file (`let cancelled = false` + cleanup) — matches the existing projects-load effect.
    4. Observe project rules:
       - `.claude/rules/frontend-react.md`: "Preserve existing UI information hierarchy" — no visual changes. Only state-initialization changes.
       - Skeleton/perceived-performance: the section already renders immediately with defaults. Hydration swaps the value in-place within one render; no spinner needed.

    **Do not:**
    - Do not replace the hardcoded `useState(120)` / `useState(10.0)` / `useState(true)` with `useState<number | null>(null)` and a loading gate — that would introduce a layout shift and contradicts CLAUDE.md's perceived-performance rule. Optimistic defaults + in-place hydration is the correct pattern here.
    - Do not add a new endpoint call inside `handleVerbosityChange` / `handleAlertToggle` / other unrelated handlers.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client 2>&1 | tail -20</automated>
    TypeScript check: `cd /data/home/gsddashboard && npx tsc -p client/tsconfig.json --noEmit 2>&1 | tail -10` — expect no errors in ConfigPage.tsx.
  </verify>
  <done>
    - useEffect with `[]` deps added to ConfigPage.tsx, hydrates idleEnabled / idleThresholdMinutes / ramRate from /api/app-settings/:key/value.
    - 0 → toggle off path works. Positive integer → toggle on + input value path works.
    - No new visible loading state, no layout shift, no TypeScript errors.
    - `npm run test:client` passes (or only pre-existing unrelated failures — note in summary).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human verification — settings survive reload on live Railway</name>
  <what-built>
    - New GET /api/app-settings/:key/value plaintext-read endpoint (allow-listed)
    - api.appSettings.getValue() client helper
    - ConfigPage Idle Auto-Close section hydrates from server on mount
    - idleDetector getIdleThresholdMs() require path fixed
  </what-built>
  <how-to-verify>
    Pre-req: ensure the change is deployed and live. Claude must run `git push` then `railway up --detach` and wait for the deploy to complete before handing off (per user memory: Railway does not auto-deploy; always confirm the new version is live via the URL).

    **On the live Railway URL (https://gsd-dashboard-production.up.railway.app):**

    1. Open Configuration page. Navigate to Idle Auto-Close section.
    2. Change Idle threshold to `45` minutes. Click Save. Confirm "Saved" pill appears.
    3. Hard-reload the page (Cmd-Shift-R / Ctrl-Shift-R).
    4. **Expected:** The threshold input still shows `45`, not `120`. The toggle still shows on.
    5. Toggle "Auto-close idle sessions" off. Confirm "Saved" pill.
    6. Hard-reload.
    7. **Expected:** Toggle still shows off. Threshold input is hidden.
    8. Toggle back on. Confirm threshold input re-appears — it may show the last value (45) or the default 120 — either is acceptable per the behavior spec.
    9. Change Railway RAM rate to `12.5`. Click Save next to it. Hard-reload.
    10. **Expected:** Input shows `12.5`, not `10.0`.
    11. Open browser DevTools → Network. Hard-reload. Confirm the page fires:
        - GET /api/app-settings/idle_timeout_minutes/value → 200 with `{"key":"idle_timeout_minutes","value":"<your_value>"}`
        - GET /api/app-settings/railway_ram_rate_monthly/value → 200 with `{"key":"railway_ram_rate_monthly","value":"<your_value>"}`
    12. Secret-safety spot check: `curl -s -o /dev/null -w "%{http_code}\n" https://gsd-dashboard-production.up.railway.app/api/app-settings/railway_pat/value` → expect `403`.
    13. Leave the settings in a sane final state (threshold 45 or 120, RAM rate 10.0, toggle on) before signing off.
  </how-to-verify>
  <resume-signal>Type "approved" if every check above passed. Otherwise describe which step failed and the actual vs expected behavior.</resume-signal>
</task>

</tasks>

<verification>
- Backend: `npm run test:server` clean.
- Frontend: `npm run test:client` clean, `tsc --noEmit` clean for ConfigPage.tsx.
- Route order: new `/:key/value` handler registered BEFORE `/:key` in server/routes/app-settings.js.
- Security: non-allow-listed keys return 403 from /value endpoint (hand-verified via curl).
- Live: settings persist across a hard reload on the deployed Railway URL.
</verification>

<success_criteria>
- User changes idle threshold from 120 → 45, saves, reloads. Value is 45 after reload.
- User toggles off, reloads. Toggle is still off.
- User changes RAM rate from 10.0 → 12.5, saves, reloads. Value is 12.5 after reload.
- `curl /api/app-settings/railway_pat/value` returns 403 — secrets still unreadable over the wire.
- `npm run test:server` and `npm run test:client` pass (or only pre-existing unrelated failures, documented in summary).
</success_criteria>

<output>
After completion, create `.planning/quick/260417-rqs-fix-auto-close-pause-settings-not-persis/260417-rqs-SUMMARY.md`. After verify checkpoint passes: `git push` and `railway up --detach`, then wait for the deployment to go live before signalling done (per /data/home/.claude/projects/-data-home-gsddashboard/memory/feedback_wait_for_deploy.md).
</output>
