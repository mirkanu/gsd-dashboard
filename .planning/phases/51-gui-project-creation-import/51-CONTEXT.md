# Phase 51: GUI Project Creation + Import - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

From the Dashboard (no SSH, no manual file edits), the user can:
1. **Create** a new GSD project: new subfolder under `/data/home/`, `git init`, private GitHub repo via stored PAT (Phase 45 encrypted credentials), initial commit + push, GSD installed, tmux session started, Claude Code launched, `/gsd-new-project` auto-sent as the first message — all end-to-end, no manual follow-up.
2. **Import** an existing folder as a GSD project: pick from auto-detected unregistered folders under `/data/home/`, or enter a custom path; if no `.planning/` exists, run `/gsd-analyse-codebase` to seed it (after user confirmation); register in `gsd-projects.json`; start tmux.

Out of scope: templates beyond "blank"; path pickers outside `/data/home/`; automatic org/account heuristics; rollback-all-on-failure semantics.

</domain>

<decisions>
## Implementation Decisions

### Wizard Flow & Placement

- **D-01: Entry point** — "+ New Project" button at the top of the left projects list/sidebar. Always visible; matches the create affordance in most project managers. Import is a secondary action accessible from the same surface (e.g. split-button dropdown or a small "Import existing" link below the primary CTA).
- **D-02: Wizard UI** — Modal dialog overlaying the current view. Matches existing dialog patterns (CostDialog). Mobile-friendly; preserves Dashboard context behind.
- **D-03: Pacing** — Single form (all fields visible): Name → Description → Template → Visibility. Submit disabled until required fields valid.
- **D-04: Submit UX** — Modal closes immediately on submit; a skeleton card appears in the projects list in a `creating` state with a live progress chip transitioning through the pipeline steps (`creating repo` → `pushing` → `starting tmux` → `launching Claude`). Card flips to `working` when the tmux session is live and `/gsd-new-project` has been sent. Satisfies NPC-03's "5s appear, working state" requirement via the existing Phase 43 state broadcaster.

### Templates & Scaffolding

- **D-05: Template set (v5.0)** — Blank only. No Next.js/Node/Python options day one. The new-project interview (Claude in tmux) is where the project takes shape — matches the "user describes, Claude does" principle. Additional templates deferred to v5.1+.
- **D-06: Blank scaffold contents** — `README.md` stub, sensible `.gitignore` (node_modules, .env, .planning/worktrees, common OS artifacts), GSD installed via npm. **No pre-seeded `CLAUDE.md`** — the global CLAUDE.md template is Phase 56B's concern; do not encroach.
- **D-07: Project location** — Fixed root `/data/home/{sanitized-name}`. Name sanitization: lowercase, ASCII, spaces → dashes, strip disallowed chars, collapse dashes, trim leading/trailing. No path picker in the wizard. Root path configurable in `app_settings` for ops flexibility but not surfaced to the user.
- **D-08: Tmux boot sequence** — After scaffolding completes, Dashboard creates the tmux session, auto-launches Claude Code in it, then sends `/gsd-new-project` as the first message. Opening the project card shows the interview already running — one-click start. Honors design principle #3 (end-to-end, no manual step).

### Import Flow

- **D-09: Import input surface** — Import dialog has a dropdown of auto-detected unregistered folders under `/data/home/` (backend scans for folders not present in `gsd-projects.json`), plus a "Or enter a custom path" text input beneath it for edge cases (folders outside the root, renamed dirs, etc.). Dropdown populated live on dialog open.
- **D-10: Seeding when `.planning/` missing** — Show a confirmation dialog: "This folder isn't a GSD project yet — seed `.planning/` by running `/gsd-analyse-codebase`?" [Confirm / Cancel]. On confirm, import proceeds and Dashboard auto-runs analyse-codebase in the new tmux session; card shows `analyzing` state, transitions to `working` on completion. On cancel, import aborts (no half-imported state).
- **D-11: Conflict handling** — Name/path collisions (project already registered, tmux session already named that, or folder already in `gsd-projects.json`) block submit with a plain-English inline error: "A project named X already exists — pick a different name or open the existing one", with a link to the existing card. For tmux-only collisions (session exists but not registered), suggest registering the existing session under a new name.

### Failure Modes & Recovery

- **D-12: Recovery model** — Keep partial state + "Resume" button. The creation pipeline (subfolder → git init → GitHub repo → push → GSD install → tmux start → auto-send) is broken into discrete steps; Dashboard records which step last succeeded. On failure, the card shows `Setup incomplete — failed at {step}` with a "Resume" button that reruns from the failed step. No destructive rollback. Honors principle #3: Claude/GSD completes the task, doesn't leave a "you fix it manually" handoff.
- **D-13: Multi-org PAT selection (NPC-06)** — Default PAT + override dropdown. One PAT flagged `default: true` in the credentials panel; wizard pre-fills with that PAT. Wizard shows a small "GitHub account: {login}" dropdown to override. If only one PAT configured, dropdown is hidden (no spurious decision).
- **D-14: Pre-flight PAT gate** — Before the wizard opens, check that at least one GitHub PAT is configured. If none: "New Project" button is active but on click, opens the Services credentials panel instead of the wizard, with an inline hint "Add a GitHub PAT to enable project creation". Prevents mid-wizard credential-missing failures (NPC-05) and keeps the wizard's happy path clean.
- **D-15: Error surface** — All failures (GitHub API errors, disk full, git push rejection, gh CLI not installed, tmux create failure) surface as plain-English messages on the card and in a toast. Never stack traces. NPC-05 compliance.

### Claude's Discretion

- Exact wording of button labels, progress chip copy, confirmation dialogs, and inline errors. Follow existing Dashboard copy tone (concise, present tense, no emoji unless user requests).
- Visual design of the skeleton-creating card state — reuse existing `Card` + `Skeleton` primitives; extend with a progress chip that reads from the in-memory state broadcaster.
- Whether to store the detected-folders scan as a cached server-side endpoint (`GET /api/projects/import-candidates`) or recompute on dialog open. Recommend the endpoint with a short TTL for responsiveness.
- Implementation of the "Resume" pipeline — recommend a per-project `creation_state` row in SQLite tracking step progress, cleared on success.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 51: GUI Project Creation + Import" — phase goal, dependencies
- `.planning/REQUIREMENTS.md` §NPC-01..NPC-06 — acceptance criteria

### Project-level principles
- `.planning/PROJECT.md` §"Design Principles (v5.0)" — especially #3 (end-to-end, Claude runs/waits/verifies), #5 (autonomous testing default), #7 (Dashboard is the control plane)
- `/data/home/CLAUDE.md` §"Web UI: Perceived Performance" — skeleton cards, Suspense, optimistic UI apply to the wizard-submit → card-appears path

### Existing code to extend
- `server/routes/gsd.js` — existing project listing / config-load pattern; extend rather than fork for new project registration
- `server/routes/services.js` — service-attachment pattern; new projects auto-wire default services (GitHub + Claude) the same way
- `server/routes/app-settings.js` — encrypted credentials (Phase 45 AES-GCM); source of GitHub PATs (key `github_pat`, plus any additional named PATs for multi-org)
- `server/routes/proxy.js` — `PROXY_PREFIXES` must be updated for any new `/api/projects/*` and `/api/import/*` endpoints (Phase 45 post-deploy bug — do not repeat)
- `server/routes/terminal.js` — tmux session lifecycle; auto-launch Claude + auto-send first message pattern
- `scripts/install-hooks.js` — post-50.5 rewrite; reused when installing GSD into a new project
- `server/db.js` — schema migration site for `creation_state` (D-12) tracking table
- `client/src/components/` — existing Card/Skeleton/Dialog primitives for the wizard modal and skeleton card

### Prior phase commits (pattern references)
- Quick task #45 (2026-04-15, `aa09c13`) — manual one-off project creation (GameMCP). Study as the imperative reference for what the wizard must automate.
- Phase 45 Plan 04 proxy-prefix fix (`6817e0a`) — cautionary tale for any new routes

### Future phase awareness (informational, do not encroach)
- Phase 54 (Admin-API Onboarding) — richer credentials UX; Phase 51 consumes only GitHub PAT
- Phase 58 (Project Maturity Stages) — new projects default to `draft` stage; Phase 51 must set `stage: draft` on insert (field added in Phase 58, so coordinate if 58 lands first)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gsd-projects.json` — canonical project registry with `{ name, root, tmux_session, services[] }` shape; extend with any new project entries
- Encrypted credentials store in `app_settings` (Phase 45 AES-GCM helpers) — source of GitHub PATs
- Phase 43 state broadcaster + WebSocket push — drives the `creating` → `working` card transition without polling
- xterm.js terminal + tmux session lifecycle (Phase 37+) — new session creation, Claude launch, send-keys
- Existing Dashboard modal/dialog patterns (CostDialog, etc.) — reuse for the wizard

### Established Patterns
- Singleton-row `app_settings` with PRAGMA-guarded idempotent migrations (Phase 50.5)
- Redacted-editor pattern for secrets (Phase 45 Plan 04) — PAT never round-trips through the client
- Route file → sub-routes mount-order discipline (Phase 45 Plan 02) — order matters to avoid catch-all shadowing

### Integration Points
- Top-level projects list component — new button lives at its top
- `server/index.js` router mount — new `/api/projects/create`, `/api/projects/import`, `/api/projects/import-candidates` endpoints register here
- `server/routes/proxy.js` `PROXY_PREFIXES` — must include all three new routes for Railway forwarding
- `gsd-projects.json` write path — new projects append here atomically (with a lock or fsync) to avoid races with Dashboard reload

</code_context>

<specifics>
## Specific Ideas

- The auto-send of `/gsd-new-project` into the new tmux session must happen only after Claude Code has fully booted — reuse the ready-detection heuristic from quick task #46 (auto-resume-work after re-open tmux, `234f54d`). Don't fire the slash command before Claude's prompt is ready.
- Detected-folder scan should filter out obvious non-project folders: dotfiles (`.*`), known system dirs, and folders without either `.git/` or a recognizable project manifest (package.json, pyproject.toml, Cargo.toml, go.mod, etc.). Be liberal — a false positive is harmless (user just picks another), a false negative hides a real project.
- Initial commit message: `"chore: initial commit"` — short, present tense, matches repo convention.

</specifics>

<deferred>
## Deferred Ideas

- **Templates beyond blank** — Next.js / Node / Python starter kits. Deferred to v5.1+ when we have data on which templates people actually want.
- **Path pickers outside /data/home/** — advanced filesystem browser. Defer until a real use case surfaces.
- **Branch protection on initial push** — pre-enable GitHub branch protection, required reviews, CI checks. Belongs in Phase 58 (Launched-stage projects) when branch workflow matters.
- **Default branch configurability** — assume `main`; re-visit if a user hits a `master`-only org.
- **Auto-services selection beyond GitHub + Claude** — Railway/Vercel/OpenAI inference at creation time. Belongs in Phase 54 (Admin-API Onboarding).
- **Import of folders with dirty working trees** — warn the user but don't auto-commit; punt to Phase 53 auto-verify for a cleaner story.
- **Stage field (`stage: draft`)** — coordinate with Phase 58. If 58 lands first, Phase 51 must set it; if 51 lands first, 58's migration handles backfill.

### Reviewed Todos (not folded)

None — no pending todos matched Phase 51 scope closely enough to fold.

</deferred>

---

*Phase: 51-gui-project-creation-import*
*Context gathered: 2026-04-20*
