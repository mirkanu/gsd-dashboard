---
phase: quick-38
plan: 38
type: execute
wave: 1
depends_on: []
files_modified:
  - server/db.js
  - server/routes/config.js
  - server/__tests__/config.test.js
  - client/src/pages/ConfigPage.tsx
autonomous: true
requirements:
  - QUICK-38-01
  - QUICK-38-02
  - QUICK-38-03

must_haves:
  truths:
    - "Global tab shows verbosity dropdown and Telegram alert toggles"
    - "Changing a global default auto-saves to __global__ row in project_settings"
    - "After save, a confirmation dialog offers to apply the new defaults to all existing projects"
    - "Confirming the dialog overwrites every non-__global__ row with the new global values"
    - "Projects without a settings row fall back to the __global__ defaults when read"
  artifacts:
    - path: "server/routes/config.js"
      provides: "GET/PUT /api/config/project-settings/__global__ and POST /api/config/project-settings/apply-global"
    - path: "server/db.js"
      provides: "applyGlobalSettings prepared statement / helper"
    - path: "client/src/pages/ConfigPage.tsx"
      provides: "Global-tab verbosity+telegram controls and apply-to-all confirmation dialog"
  key_links:
    - from: "client/src/pages/ConfigPage.tsx"
      to: "/api/config/project-settings/apply-global"
      via: "fetch POST after user confirms dialog"
      pattern: "apply-global"
    - from: "server/routes/config.js"
      to: "project_settings table"
      via: "UPDATE ... WHERE project_key != '__global__'"
      pattern: "__global__"
---

<objective>
Add global default settings (verbosity + Telegram alerts) to the Config page's Global tab, persisted in SQLite using a reserved `__global__` row in the existing `project_settings` table. When a global default changes, prompt the user to apply it to all existing projects in one shot. New projects inherit global defaults automatically on first read.

Purpose: Eliminates the need to configure verbosity and Telegram alerts per project. Reuses the existing schema so no migration is required.

Output:
- Backend: global read/write via the existing `project-settings/:project` endpoints (with `__global__` as a valid key), plus a new `apply-global` endpoint that bulk-updates all non-global rows.
- Backend: `GET /api/config/project-settings/:project` falls back to `__global__` row when the project has no row.
- Frontend: verbosity dropdown + Telegram toggles visible on the Global tab, with auto-save and an apply-to-all confirmation dialog.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@server/db.js
@server/routes/config.js
@client/src/pages/ConfigPage.tsx

<interfaces>
Existing schema (server/db.js):
- Table `project_settings(project_key TEXT PRIMARY KEY, verbosity TEXT, telegram_alerts TEXT, updated_at TEXT)`
- `telegram_alerts` is a JSON string parsed on read.
- Prepared statements already exist: `getProjectSettings`, `upsertProjectSettings`, `listProjectSettings`.

Existing endpoints (server/routes/config.js):
- `GET  /api/config/project-settings/:project` — returns row or defaults
- `PUT  /api/config/project-settings/:project` — upserts row (auto-save from UI)

Reserved key:
- `project_key = '__global__'` is the single row holding global defaults. It MUST be excluded from any bulk/list operation that enumerates "real" projects.

Frontend state shape (ConfigPage.tsx):
- `verbosity: 'quiet' | 'normal' | 'verbose'`
- `telegramAlerts: { taskComplete: boolean; waitingOnUser: boolean; ... }`
- Auto-save: dropdown/toggle change -> PUT to `/api/config/project-settings/:project`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — global row support, fallback read, and apply-global endpoint</name>
  <files>server/db.js, server/routes/config.js, server/__tests__/config.test.js</files>
  <action>
1. In `server/db.js`:
   - Add a constant `GLOBAL_SETTINGS_KEY = '__global__'` and export it.
   - Add a prepared statement / helper `applyGlobalSettings(verbosity, telegramAlertsJson, updatedAt)` that runs:
     `UPDATE project_settings SET verbosity = ?, telegram_alerts = ?, updated_at = ? WHERE project_key != '__global__'`
     and returns `{ changes }` from the run result.
   - Add a helper `getGlobalSettings()` that returns the parsed `__global__` row or a hardcoded default
     (`{ verbosity: 'normal', telegram_alerts: { taskComplete: false, waitingOnUser: false } }`) if the row does not exist.
   - Ensure `listProjectSettings()` filters out `project_key = '__global__'` so existing list consumers never see it as a project.

2. In `server/routes/config.js`:
   - Update `GET /api/config/project-settings/:project` so that when the project has no row AND `project !== '__global__'`,
     it returns the global defaults (via `getGlobalSettings()`) instead of the hardcoded fallback. Response shape must be identical
     to today: `{ project, verbosity, telegram_alerts, updated_at }`. Do NOT auto-create a row on read.
   - Allow `:project === '__global__'` to pass through existing GET/PUT handlers unchanged (it is just another row key).
   - Add `POST /api/config/project-settings/apply-global` that:
     a) reads current global row via `getGlobalSettings()`,
     b) calls `applyGlobalSettings(verbosity, JSON.stringify(telegram_alerts), new Date().toISOString())`,
     c) returns `{ ok: true, updated: <changes> }`.
     If no global row exists yet, return `400 { error: 'No global settings to apply' }`.

3. Add tests in `server/__tests__/config.test.js` (extend existing file):
   - PUT `/api/config/project-settings/__global__` stores global defaults.
   - GET `/api/config/project-settings/__global__` returns what was stored.
   - GET `/api/config/project-settings/some-new-project` (no row) returns the global defaults.
   - POST `/api/config/project-settings/apply-global` after seeding 2 non-global rows updates both; `__global__` row is unchanged in structure; `listProjectSettings()` does not include `__global__`.

Do NOT add a new table or run any migration — the `project_settings` schema already fits. Do NOT touch hook/websocket code.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server</automated>
  </verify>
  <done>All existing server tests still pass; new tests for global row, fallback read, and apply-global all pass; `listProjectSettings` excludes `__global__`.</done>
</task>

<task type="auto">
  <name>Task 2: Frontend — Global tab controls + apply-to-all confirmation dialog</name>
  <files>client/src/pages/ConfigPage.tsx</files>
  <action>
1. Remove the conditional that hides the verbosity dropdown and Telegram alert toggles when the active tab is Global. They must render on the Global tab, bound to state loaded from `/api/config/project-settings/__global__`.

2. On Global tab mount (or when tab switches to Global), fetch `/api/config/project-settings/__global__` and hydrate local state. On other tabs, keep existing per-project behavior unchanged.

3. When the user changes verbosity or any Telegram toggle ON THE GLOBAL TAB:
   a) Auto-save immediately via `PUT /api/config/project-settings/__global__` (reuse existing save helper — just pass `__global__` as the project key).
   b) After the PUT resolves successfully, open a confirmation dialog (use the existing shadcn `AlertDialog` already in the project; if not present, a simple `window.confirm` is acceptable as a fallback but prefer AlertDialog for consistency).
      - Title: "Apply to all existing projects?"
      - Body: "This will override the current verbosity and Telegram alert settings for every existing project with your new global defaults. This cannot be undone."
      - Buttons: "Cancel" (default) and "Apply to all".
   c) On "Apply to all": `POST /api/config/project-settings/apply-global`, show a sonner toast `Applied to {updated} projects` on success or an error toast on failure.
   d) On "Cancel": close the dialog, leave per-project rows untouched. Global save already happened.

4. Do NOT trigger the dialog when editing per-project tabs — only the Global tab. Debounce is NOT required; each change triggers its own save + dialog cycle is acceptable, but coalesce so the dialog doesn't stack: if the dialog is already open, don't open another — just update the pending values it will apply.

5. Keep the existing per-project auto-save behavior on other tabs untouched. Preserve response shapes and existing copy where possible.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client</automated>
  </verify>
  <done>Global tab shows verbosity + Telegram controls hydrated from `__global__`; changing them auto-saves and prompts to apply; confirming calls `apply-global` and shows success toast; canceling leaves other projects unchanged; client tests pass.</done>
</task>

</tasks>

<verification>
- `npm run test:server` passes (includes new config tests).
- `npm run test:client` passes.
- Manual smoke on live Railway after deploy:
  1. Open Config → Global tab → change verbosity to `verbose` → dialog appears → click "Apply to all" → open any project tab → verbosity is `verbose`.
  2. Change a Telegram toggle on Global → dialog appears → click Cancel → project tabs keep their previous Telegram settings.
  3. A brand-new project (no row yet) reads back the current global defaults from `GET /api/config/project-settings/:project`.
</verification>

<success_criteria>
- Global tab exposes verbosity + Telegram alert controls backed by a `__global__` row in `project_settings`.
- Changing a global default auto-saves, then prompts the user to apply to all existing projects.
- Confirming overwrites every non-`__global__` row in one DB statement; canceling does not.
- Projects without a settings row inherit global defaults on read.
- No schema migration; `listProjectSettings()` never returns the `__global__` row.
- Existing per-project Config tab behavior unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/38-add-global-default-settings-with-apply-t/38-SUMMARY.md`
</output>
