# Phase 50: Non-Programmer Mode Foundation - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Discussion:** User declined gray-area discussion — Claude's recommended defaults locked below. Edit before `/gsd-plan-phase 50` if any default is wrong.

<domain>
## Phase Boundary

Add a Dashboard-wide `ui_mode` toggle (`novice` | `expert`, default `novice`), persisted in `app_settings`, switchable from a top-bar control surviving refresh and redeploy. Route every user-visible Dashboard string through a translation layer (`copywriting`) so novice mode never exposes the words `phase`, `plan`, `milestone`, or slash commands. Restructure the Settings page into a "System" section (technical, expert-leaning) and a "First-run" section (guided, novice-leaning). Terminal output is **out of scope** — that is Phase 56.

</domain>

<decisions>
## Implementation Decisions

### D-01: Persistence (NPM-01)
- `ui_mode` lives in the existing `app_settings` table (singleton row pattern already used by `server/routes/app-settings.js`).
- Column type: `TEXT` with CHECK constraint `IN ('novice','expert')`, default `'novice'`.
- Migration: idempotent `ALTER TABLE app_settings ADD COLUMN ui_mode TEXT NOT NULL DEFAULT 'novice'` guarded by `PRAGMA table_info` check.
- Read endpoint: extend existing `GET /api/app-settings`; write endpoint: extend existing `PATCH /api/app-settings`. No new routes.

### D-02: Toggle UI (NPM-01)
- Control lives in `client/src/components/Layout.tsx` top bar (right side, near existing controls).
- Visual: shadcn-style segmented switch labeled `Novice | Expert`. Always visible (never hidden behind a menu) — discoverability matters.
- Optimistic update: flip mode in client state immediately, PATCH server, revert + toast on failure.
- Mode is also surfaced (read-only mirror + switch) inside the new Settings → First-run section.

### D-03: Translation layer shape (NPM-04)
- New module: `client/src/lib/copywriting.ts`.
- Public API:
  - `t(key: string, fallback?: string): string` — pure function; reads current mode from a module-level setter.
  - `useT()` — React hook returning a memoized `t` bound to the current `ui_mode` from settings context.
  - `setUiMode(mode)` — called by the settings provider when mode changes.
- Storage: a single nested object `copy = { novice: {...}, expert: {...} }`. Keys use dotted notation (`nav.phase`, `button.runPlan`, `toast.executed`).
- Key naming: domain.subject (no leading verb). Lowercase camelCase per segment.
- Missing-key behavior: in `novice` mode, fallback to the `expert` string for the same key; if absent in both, return the literal key in DEV with a `console.warn`, return the key silently in PROD. This prevents blank UI.
- Initial dictionary covers at minimum: `phase → Step`, `plan → Task`, `milestone → Version`, plus every nav label, button label, page title, toast string, and empty-state string surfaced by the DOM scan from D-05.

### D-04: Coverage scope (NPM-02)
- **In scope (must use `t()`):**
  - JSX text children that are string literals
  - String-literal props on standard elements: `title`, `aria-label`, `aria-description`, `placeholder`, `alt`
  - Toast / sonner message bodies and titles
  - Page `<title>` and document headings
  - Empty-state and error-boundary copy authored by us
- **Out of scope (allowed to bypass `t()`):**
  - Dynamic data from API or DB (project names, file paths, log lines, command output, server error `message` fields)
  - Strings inside `<code>`, `<pre>`, terminal panes, log viewers
  - Numeric formats, dates, ISO timestamps
  - Third-party component internals (shadcn primitives, recharts labels we pass dynamic values to)
- An explicit allowlist file (`client/src/lib/copywriting-allowlist.ts`) holds any genuinely-not-translatable string literals so the AST scan in D-05 can skip them with a written reason.

### D-05: NPM-02 enforcement (test strategy)
- Two complementary checks:
  1. **AST lint** — `npm run test:client:i18n` runs a Vitest test that walks every `client/src/**/*.{ts,tsx}` (excluding `__tests__`, `*.test.tsx`, generated files), parses JSX, and flags any string literal in scope D-04 that is not wrapped in `t(...)` and not in the allowlist. Fails the run on any new violation.
  2. **DOM smoke scan** — Vitest renders each top-level page (`Settings`, `GSD`, `Usage`, `Services`, `ConfigPage`, plus key panels) under `ui_mode=novice` with mocked data and asserts the rendered text contains none of: `/\bphase\b/i`, `/\bplan\b/i`, `/\bmilestone\b/i`, `/\/gsd[:-]\w+/`. Slash-command regex covers both `/gsd:foo` and `/gsd-foo` forms used in this repo.
- Both checks wired into `npm run test:client`. CI failure on regression.

### D-06: Settings page split (NPM-05)
- Single `Settings` page (no separate route) with **tabs**: `First-run` (default tab when `ui_mode=novice`) and `System` (default tab when `ui_mode=expert`).
- **First-run tab contents:** Mode switch (mirror of top-bar), project intro/walkthrough placeholder, links to "what is a Step / Task / Version", any onboarding-style settings.
- **System tab contents:** All existing technical settings currently on `Settings.tsx` — pricing editor, idle-detector configs, credentials links, advanced toggles.
- Existing settings stay where they functionally belong; nothing is removed. The split is presentational only.
- Tab component: shadcn `Tabs` (already in dependency tree if present; otherwise add via shadcn CLI).

### D-07: Expert mode = no regressions (NPM-03)
- Expert mode renders the **expert** branch of every `t()` call. Expert strings are the verbatim copy that exists today — produced by extracting current literals into the dictionary as the `expert` value, then authoring `novice` alternates.
- Snapshot tests: capture current rendered output of each top-level page **before** the `t()` migration, then assert expert-mode output matches the snapshot post-migration.

### Claude's Discretion
- Exact wording of every novice-mode string beyond the locked translations (`phase → Step`, `plan → Task`, `milestone → Version`). Planner / executor will draft per page; user can edit the dictionary file directly afterward.
- Visual styling of the segmented switch (sizing, colors) — follow existing shadcn token usage.
- Whether to introduce a React context provider vs zustand store for `ui_mode` — pick whichever matches existing settings state pattern in the codebase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 50: Non-Programmer Mode Foundation" — phase goal and dependencies
- `.planning/REQUIREMENTS.md` §NPM-01..NPM-05 — acceptance criteria

### Existing code (analogues to extend)
- `server/routes/app-settings.js` — pattern for app_settings GET/PATCH; extend rather than fork
- `server/db.js` — schema initialization site for the `ui_mode` column migration
- `server/__tests__/app-settings-route.test.js` — test pattern for the route extension
- `client/src/components/Layout.tsx` — top bar host for the toggle
- `client/src/pages/Settings.tsx` — page to restructure into tabs
- `client/src/components/Sidebar.tsx` — nav label site (must consume `t()`)
- `client/src/test-setup.ts` — Vitest setup for the new i18n + DOM-scan tests

### Project conventions
- `/data/home/CLAUDE.md` — global perceived-performance rules (loading.tsx, skeletons, optimistic updates) apply to the toggle interaction
- `CLAUDE.md` (project root) — non-negotiable engineering rules; testing policy

### Future phase awareness (informational)
- `.planning/ROADMAP.md` §"Phase 56" — terminal verbosity (out of scope here, do not encroach)
- `.planning/ROADMAP.md` §"Phase 56B" — non-programmer behavioural contract; consumes the `ui_mode` flag from this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app_settings` table + `/api/app-settings` GET/PATCH route — extend; do not create a parallel settings store
- shadcn primitives already in `client/src/components/` — reuse switch / tabs styling
- Existing Vitest setup in `client/src/test-setup.ts` for the new i18n tests

### Established Patterns
- Singleton-row `app_settings` with idempotent PRAGMA-guarded migrations (see Phase 50.5 cleanup commits for the pattern)
- React pages live in `client/src/pages/`, components in `client/src/components/`
- Server tests in `server/__tests__/`, client tests in `client/src/components/__tests__/`

### Integration Points
- Top-bar slot in `Layout.tsx` for the toggle
- Settings provider/context (or equivalent) for broadcasting `ui_mode` changes to `copywriting.ts`
- `npm run test:client` and `npm run test:server` gates the new checks must hook into

</code_context>

<specifics>
## Specific Ideas

- Locked vocabulary: `phase → Step`, `plan → Task`, `milestone → Version`. These exact substitutions are non-negotiable per NPM-04.
- Slash-command suppression in novice mode covers both `/gsd:foo` (legacy) and `/gsd-foo` (current) forms — the regex must handle both.

</specifics>

<deferred>
## Deferred Ideas

- Localization beyond English (i18n proper, not just novice/expert tone) — out of scope; not a requirement.
- Translating server-emitted error messages — server is mode-agnostic in this phase. If needed later, translate at the toast site, not the server.
- Terminal-pane verbosity (`Phase 56`) — explicitly carved out of this phase by the ROADMAP.
- Non-programmer behavioural contract for Claude itself (`Phase 56B`) — consumes this phase's flag; do not pre-implement here.

</deferred>

---

*Phase: 50-non-programmer-mode-foundation*
*Context gathered: 2026-04-18*
</content>
</invoke>