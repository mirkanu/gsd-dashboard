# Requirements — v5.0 Non-Programmer Mode

**Milestone:** v5.0 Non-Programmer Mode
**Defined:** 2026-04-18
**Core value shift:** From "session manager for someone living inside GSD and Claude Code" → "build, run, and evolve software by describing what you want, with the Dashboard handling everything that surrounds the CLI."

Prior milestone requirements (v3.x and v4.x) are archived under `.planning/milestones/v4.3/REQUIREMENTS.md`.

---

## CLN — Original-Repo Cleanup

| ID | Requirement | Phase |
|----|-------------|-------|
| CLN-01 | Remove `/kanban` route, Sessions list view, SessionDetail view, and ActivityFeed (superseded by project-centric views). | 50.5 |
| CLN-02 | Move `KanbanBoard.tsx` to `client/src/components/board/` as generic reusable primitive, stripped of agent-specific logic; no route references it (parked for Phase 61 in v5.1). | 50.5 |
| CLN-03 | Remove `useNotifications` hook and Settings browser-notification toggles (Telegram replaces via Phase 54B). | 50.5 |
| CLN-04 | Remove `scripts/seed.js`, `scripts/import-history.js`, the standalone `statusline/` directory, and the import-history startup hook in server boot. | 50.5 |
| CLN-05 | Audit unused server routes (`events.js`, `agents.js`) and SQL tables (`agents`, `events`, stale `token_usage` rows); drop zero-caller endpoints and corresponding schema. | 50.5 |
| CLN-06 | Remove upstream Dockerfile and unused GitHub Actions workflows; rewrite `install-hooks.js` to install the current GSD Dashboard hook set (Phase 49 busy-markers + future Phase 54B notification event hooks) in one step; remove `/api/settings/cleanup` (superseded by Phase 48); rewrite `/api/settings/export` for the current schema. | 50.5 |

---

## NPC — New Project Creation (Wizard + Import)

| ID | Requirement | Phase |
|----|-------------|-------|
| NPC-01 | "New Project" button opens a guided wizard: name → short description → template choice → GitHub visibility (private default) → done. | 51 |
| NPC-02 | Wizard creates subfolder, `git init`, installs GSD, creates a private GitHub repo via stored PAT (Phase 54), pushes initial commit, starts a tmux session, and drops the user into the GSD new-project interview — all from the browser. | 51 |
| NPC-03 | Project appears on the Dashboard within 5 seconds of wizard completion, card in `working` state, GitHub URL visible. | 51 |
| NPC-04 | "Import Existing Project" alternate flow: user provides folder path; Dashboard scans for `.planning/`, git remote, `package.json`; generates a project card and, if no `.planning/` exists, runs GSD analyse-codebase to seed one. | 51 |
| NPC-05 | Failure modes (name collision, disk full, GitHub API error, GSD install error) produce plain-English error messages, never stack traces. | 51 |
| NPC-06 | Supports multiple GitHub accounts/orgs: creation flow asks which PAT/org to use when more than one is configured. | 51 |

---

## ATV — Auto-Verify

| ID | Requirement | Phase |
|----|-------------|-------|
| ATV-01 | After `/gsd:execute-phase` completes, Dashboard automatically triggers `/gsd:verify-work` without user action. | 53 |
| ATV-02 | If verification fails, Dashboard surfaces "I hit a problem — want me to try to fix it?" with one-click retry. | 53 |
| ATV-03 | Plan cards only transition to ✅ after verification passes; failed verification keeps them in ⚠ with AI's plain-English summary of what broke. | 53 |
| ATV-04 | Pause/Archive workflow (task #68) folded in: Pause = graceful shutdown + verify-work + pause; Archive = verify-work + stop tmux + GitHub archive if applicable. | 53 |
| ATV-05 | Failure-retry logic adopts failure-propagation + circuit-breaker patterns from the `jamoeight/get-shit-done-autopilot` fork (task #55): extract failure context into retry prompts, stop after N consecutive failures. | 53 |

---

## APO — Admin-API Onboarding for External Services

*(Phase 46 from v4.3 is subsumed by these requirements; original SVC-01/03/04/05 intent preserved inside APO-01..06.)*

| ID | Requirement | Phase |
|----|-------------|-------|
| APO-01 | Project setup wizard and retro-fit panel for existing projects asks "does this project need any of the following services?" with a curated Railway-first checklist. | 54 |
| APO-02 | For each checked service, Dashboard opens a service-specific onboarding panel — OAuth where the provider supports it (GitHub, Vercel), admin-key paste with "where to find this" walkthrough otherwise. | 54 |
| APO-03 | Credentials land in `app_settings` encrypted (reusing Phase 45 AES-GCM helpers) and are exposed to the project's Claude Code session as env vars. | 54 |
| APO-04 | "Needs setup" badge on the project card calls out any declared dependency that isn't yet wired up. | 54 |
| APO-05 | Removing a service cleanly revokes the stored credential and updates the env. | 54 |
| APO-06 | Supports multiple credentials per service type (e.g. personal GitHub PAT + org GitHub PAT). | 54 |
| APO-07 | Written comparison of (a) Composio Tool Router, (b) self-hosted MCP gateway, (c) per-service MCP servers + Dashboard-managed config. | 55 |
| APO-08 | Recommendation doc includes rough token/cost estimate and ToS review (Anthropic subscription rules vs. third-party-app rules); output is a decision doc feeding a follow-up build phase in v5.1+. | 55 |

---

## NAR — CLI Verbosity Contract + Portfolio Feed

| ID | Requirement | Phase |
|----|-------------|-------|
| NAR-01 | Verbosity contract in project `CLAUDE.md` template: "skip CONTEXT.md interrogation when project already has CONTEXT.md" (task #84), "name the phase in plain English in first line of session report", "don't repeat what the user just said", "prefer one-line status updates", "active voice, present tense". | 56 |
| NAR-02 | GSD config overrides for the worst verbosity offenders (CONTEXT.md re-ask, per-plan ceremony) applied project-by-project via the Config page. | 56 |
| NAR-03 | Structured-signal extractor extends Phase 43's `extractCurrentTask` to pull session-report summaries, plan-completion events, and verification results from tmux output; surfaced as structured cards on the project page without touching the terminal stream. | 56 |
| NAR-04 | Portfolio Feed replaces the old ActivityFeed route slot: plain-English cross-project stream ("Finished wiring cost page on GSD Dashboard 2m ago") drawn from extracted signals, not arbitrary CLI scraping. | 56 |
| NAR-05 | The terminal itself is unchanged — we reduce what Claude says, not what the user sees; landmark extraction is additive. | 56 |

---

## NPB — Non-Programmer Behavioural Contract

| ID | Requirement | Phase |
|----|-------------|-------|
| NPB-01 | Global `CLAUDE.md` template contains an explicit "Do not ask the user to…" section covering forbidden behaviours and their replacements — applies to every GSD project by default. | 56B |
| NPB-02 | GSD skill overrides ensure `/gsd:discuss-phase` and `/gsd:plan-phase` don't surface implementation-level questions — all questions framed in user-outcome terms. | 56B |
| NPB-03 | Claude/GSD must complete end-to-end before pinging the user: run the commands, wait for deploys, run the tests, verify success — never "deploy started, check back in a few minutes" handoffs. | 56B |
| NPB-04 | Behavioural eval set of 20 representative prompts runs against Claude, graded for violations of the forbidden-behaviours list; target zero violations. | 56B |
| NPB-05 | When Claude genuinely needs a decision the user is qualified to make, the question is framed in user-outcome language (not jargon). | 56B |
| NPB-06 | When Claude needs a missing credential, the Dashboard surfaces a credentials-request panel (Phase 54) rather than Claude asking in the terminal. | 56B |
| NPB-07 | User-testing checkpoint with a genuine non-programmer (Emily-Kate or equivalent) runs through 3 real tasks on a Draft-stage project; any stall is a failure and feeds back into the CLAUDE.md rules. | 56B |

---

## MAT — Project Maturity Stages

| ID | Requirement | Phase |
|----|-------------|-------|
| MAT-01 | Every project has a `stage` field (`draft`\|`alpha`\|`beta`\|`launched`\|`maintenance`\|`retired`) in SQLite, defaulting to `draft` at creation time. | 58 |
| MAT-02 | Dashboard card UI varies by stage (preview URL prominence, Issues vs. Tasks, Promote button visibility); verifiable by scripting the card render for each stage. | 58 |
| MAT-03 | Stage-transition wizard guides user through prerequisites ("to move to Launched, we need: GitHub repo [✓], production URL [✗]…") and executes satisfied transitions with one click. | 58 |
| MAT-04 | Stage transitions are reversible in both directions; Beta ↔ Launched is the only transition with real data migration. | 58 |
| MAT-05 | Retired projects auto-pause tmux, auto-archive the GitHub repo, and stop incurring Railway RAM cost. | 58 |
| MAT-06 | Existing projects get a one-time backfill flow to assign their current stage — forcing a conscious decision on each. | 58 |
| MAT-07 | User-initiated but nudge-gated: when eligibility criteria are met, Dashboard suggests ("this has been in Beta 14 days with 12 commits, want to launch?") but the user always decides. | 58 |
| MAT-08 | Draft-stage "kill this project" one-click flow: confirms destruction, deletes private GitHub repo, stops tmux, removes local files, removes Dashboard entry. | 58 |

---

## NTF — Unified Notification Centre

| ID | Requirement | Phase |
|----|-------------|-------|
| NTF-01 | All Telegram output flows through a single `NotificationCentre` module in the Dashboard server; no tmux-level Telegram sends remain in the codebase. | 54B |
| NTF-02 | Event sources are the existing Dashboard event bus (`project_state_change` from Phase 43, idle events from Phase 48, cost events from Phase 45, issue events from Phase 59) — not tmux scraping. | 54B |
| NTF-03 | Settings page has a Notifications section with global enable/disable, per-event-type toggles, quiet hours, rate-limit threshold; per-project overrides surfaced on the project's Config tab (reusing Phase 42 Config UI). | 54B |
| NTF-04 | Cross-project quieting rules: rate limiting (N/hour), deduplication (two projects hitting same event within 30s → one combined message), quiet hours (per-user time window, only high-priority fires), stage-aware defaults (Draft < Launched). Verified by scripted event burst of 20 events in 10 seconds producing ≤5 notifications. | 54B |
| NTF-05 | Migration path: existing Phase 42 `telegram_alerts` config read on startup, mapped to new event-policy schema, archived after one successful delivery under the new system; old tmux-side Telegram hooks removed with a one-time audit. | 54B |

---

## TSK — Task Backend Migration + Issue GUI Wrapper

| ID | Requirement | Phase |
|----|-------------|-------|
| TSK-01 | A `task_backend` field per project (`dashboard`\|`github`) determines where task reads/writes route. | 59 |
| TSK-02 | Migration tool exports all open Dashboard tasks to GitHub Issues with label `source:dashboard-migration`, preserving creation date in the body and linking back to the Dashboard task ID. | 59 |
| TSK-03 | Issue list view on launched-project cards shows open issues with plain-English status ("3 things need sorting, 2 waiting on deploy, 1 ready to verify") rather than raw label names. | 59 |
| TSK-04 | Create-issue flow: user types plain-English description in the project card's input; Claude Haiku extracts title + body + suggested labels; Dashboard shows preview; submits via `gh issue create` on approval. | 59 |
| TSK-05 | Issue detail view renders title, description (markdown), comment thread, linked PRs, CI status; comments posted from the Dashboard without opening GitHub. | 59 |
| TSK-06 | `/gsd:quick --issue 42` reads the issue body as the brief, runs a quick task, posts a comment on completion with commit SHA and a "ready for review" note; triggered from a "Work on this" button on the issue detail view. | 59 |
| TSK-07 | Close-issue flow: "Mark done" button asks for a one-line verification note, posts it as a comment, closes the issue with state reason `completed`. | 59 |
| TSK-08 | Migration is reversible for 7 days (re-import issues as Dashboard tasks) to allow backout. | 59 |
| TSK-09 | GSD Dashboard itself stays in Beta through v5.0 and does NOT migrate its own tasks; dogfooding happens in v5.1 after validating on PRC and KidAI first. | 59 |

---

## ENV — Dev/Production Environment Manager

| ID | Requirement | Phase |
|----|-------------|-------|
| ENV-01 | During Beta→Launched transition, wizard provisions a dev environment on the project's host, provisions a separate dev Postgres on Railway if the project uses Postgres, and sets corresponding test-mode keys for services declared in Phase 54. | 60 |
| ENV-02 | Project card shows two URLs: Dev and Production, each with their own status indicator. | 60 |
| ENV-03 | "Promote dev → prod" button appears when dev has commits not on main; clicking opens plain-English diff preview ("I'm about to ship 3 changes: fixed a login bug, added dark mode, updated the about page"), asks for confirmation, executes merge + deploy. | 60 |
| ENV-04 | Promotion blocks if `verify-work` has failed on any commit in the dev→prod range; block message explains which commit and why in plain English. | 60 |
| ENV-05 | "Revert last production deploy" button always visible post-launch; one click reverts production to the previous commit on main and surfaces the rollback as a change in its own right. | 60 |

---

## Coverage

- **v5.0 requirements:** 64 total across 10 categories
- **Phases:** 50.5 + 51 + 53 + 54 + 55 + 56 + 56B + 58 + 54B + 59 + 60 = 11 phases
- **Mapped:** 64/64
- **Unmapped:** 0

## Deferred to v5.1+

- **Phase 61** — Issue Lifecycle & Stage Management (full stage board using the parked `KanbanBoard.tsx` primitive, external-reporter inbox, auto-promotion on merged PRs + green CI)
- Dashboard itself migrates Beta → Launched (dogfooding Phase 59 on own codebase)
- Reply-from-Telegram support
- Autopilot cost gate (COST-05)
- Any Phase 55 build work falling out of MCP evaluation

## Seeds (parked, may surface in v5.x)

- **SEED-001** — AI-Guided CLAUDE.md Editor (former Phase 47)
- **SEED-002** — White/day theme contrast bug (former task #82)
