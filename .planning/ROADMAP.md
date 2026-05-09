# Roadmap: GSD Dashboard

**Current milestone:** v5.1 Non-Programmer Mode
**Created:** 2026-04-18
**Prior milestones:** archived to `.planning/milestones/`

## Milestones

- ✅ **v5.0 Hetzner Migration** — Phases 62, 67–72 (shipped 2026-05-08) · [archive](milestones/v5.0-ROADMAP.md)
- ✅ **v4.3 Optimisation & Cost Intelligence** — Phases 43–49 (shipped 2026-04-18)
- 🚧 **v5.1 Non-Programmer Mode** — Phases 50.5, 51, 53, 52, 54, 56–60 (in progress)
  *(Phase 54 scope reduced: guided onboarding replaced by Global Env Editor — simpler, covers real workflow)*
  *(Phase 55 dropped: MCP tool routing is premature — global .env already handles credential distribution)*

---

## Core Value Shift (v4.x → v5.0)

From: *"At a glance, see where every GSD project stands and interact with any session"* — a session manager for someone already living inside GSD and Claude Code.

To: *"Build, run, and evolve software by describing what you want — with the Dashboard handling everything that surrounds the CLI."*

The tmux terminal stays as a first-class surface. The Dashboard wraps projects, planning, services, lifecycle, notifications, and launched-project workflows — not the conversational loop itself.

## Design Principles (codify into root CLAUDE.md, reference from every phase)

1. The terminal is a first-class surface, not a debug view — shown raw (in and out); GSD terminology and slash commands are acceptable there.
2. Never ask the user to edit or write code — the user describes, Claude does.
3. Never ask the user to do programmer things that Claude/GSD can do itself — no "run command X", no "test Y", no "deploy started, check back in a few minutes". Claude runs, waits, verifies, then pings.
4. Autonomous testing is the default, not a choice — every plan auto-runs verify-work.
5. Admin-API-first for external services — Dashboard asks for credentials upfront, provisions programmatically.
6. Minimise external services — prefer Railway-hosted solutions wherever feasible.
7. Dashboard is the control plane, tmux sessions are workers — cross-cutting concerns (status, idle detection, notifications, cost) are Dashboard-owned.
8. Progress narrated in plain English — landmark events pass through a narration layer (Dashboard cards and Portfolio Feed, not the terminal).

---

## Progress

| Phase | Plans | Status | Completed |
|-------|-------|--------|-----------|
| 50.5. Original-Repo Cleanup | 4/4 | Complete ✅ (v5.1) | 2026-04-18 |
| 51. GUI Project Creation + Import | 4/4 | Complete ✅ (v5.1) | 2026-04-20 |
| 53. Auto-Verify by Default | 4/4 | Complete ✅ (v5.1) | 2026-05-05 |
| 52. GSD Command Discoverability | 2/2 | Complete    | 2026-05-09 |
| 54. Global Env Editor | 2/2 | Complete ✅ (v5.1) | 2026-05-09 |
| 56. CLI Verbosity Contract + Portfolio Feed | 0/0 | Not planned | - |
| 56B. Non-Programmer Behavioural Contract | 0/0 | Not planned | - |
| 58. Project Maturity Stages | 0/0 | Not planned | - |
| 54B. Unified Notification Centre | 0/0 | Not planned | - |
| 59. Task Backend Migration + Issue GUI Wrapper | 0/0 | Not planned | - |
| 60. Dev/Production Environment Manager | 0/0 | Not planned | - |
| 62. Hetzner VPS Migration | 10/11 | Complete ✅ (v5.0) | 2026-05-08 |
| 67. Cockpit VPS Monitoring | 1/1 | Complete ✅ (v5.0) | 2026-05-07 |
| 68. Portainer Docker UI | 1/1 | Complete ✅ (v5.0) | 2026-05-07 |
| 69. VPS System Stats Page in GSD Dashboard | 1/1 | Complete ✅ (v5.0) | 2026-05-07 |
| 70. Hetzner Non-Root User | 3/3 | Complete ✅ (v5.0) | 2026-05-05 |
| 71. CLAUDE.md-First Automation Refactor | 2/2 | Complete ✅ (v5.0) | 2026-05-06 |
| 72. Disk Full Prevention | 5/5 | Complete ✅ (v5.0) | 2026-05-08 |

---

## Execution Order (dependency graph)

```
50.5 (cleanup) ──→ 51 (project creation)
                   ├──→ 53 (auto-verify)
                   ├──→ 54 (global env editor)
                   ├──→ 56 (verbosity + feed) ──→ 56B (behavioural contract)
                   └──→ 58 (maturity stages) ──┬──→ 54B (notification centre)
                                                ├──→ 59 (task migration + issue GUI)
                                                └──→ 60 (dev/prod envs)
```

Phase 56B depends on both 54 (global env editor) and 56 (verbosity).
Phase 54B depends on 58 (stage-aware defaults) alongside the already-shipped Phase 43.

---

## Coverage (v5.1)

- v5.1 requirements: 64 total (see REQUIREMENTS.md)
- Mapped to phases: 62 (APO-07, APO-08 deferred — Phase 55 dropped)
- Unmapped: 2

| Phase | Requirements |
|-------|--------------|
| 50.5 | CLN-01, CLN-02, CLN-03, CLN-04, CLN-05, CLN-06 |
| 51 | NPC-01, NPC-02, NPC-03, NPC-04, NPC-05, NPC-06 |
| 53 | ATV-01, ATV-02, ATV-03, ATV-04, ATV-05 |
| 54 | APO-01, APO-02 |
| 56 | NAR-01, NAR-02, NAR-03, NAR-04, NAR-05 |
| 56B | NPB-01, NPB-02, NPB-03, NPB-04, NPB-05, NPB-06, NPB-07 |
| 58 | MAT-01, MAT-02, MAT-03, MAT-04, MAT-05, MAT-06, MAT-07, MAT-08 |
| 54B | NTF-01, NTF-02, NTF-03, NTF-04, NTF-05 |
| 59 | TSK-01, TSK-02, TSK-03, TSK-04, TSK-05, TSK-06, TSK-07, TSK-08, TSK-09 |
| 60 | ENV-01, ENV-02, ENV-03, ENV-04, ENV-05 |

---

### Phase 50.5: Original-Repo Cleanup

**Goal:** Strip out dormant and mis-fitting features inherited from the upstream `hoangsonww/Claude-Code-Agent-Monitor` fork. Mostly deletion; handle as a sequence of quick tasks before the rest of v5.0 kicks off.
**Requirements:** CLN-01 through CLN-06
**Depends on:** Nothing
**Plans:** 4/4 complete
- [x] 50.5-01-PLAN.md — CLN-01/02/03 client route + view + browser-notification deletions
- [x] 50.5-02-PLAN.md — CLN-04 scripts/seed + import-history + statusline deletions
- [x] 50.5-03-PLAN.md — CLN-05 route+schema audit and dead-table DROP
- [x] 50.5-04-PLAN.md — CLN-06 Dockerfile/workflows + install-hooks rewrite + /api/settings changes

---

### Phase 51: GUI Project Creation + Import

**Goal:** Create a new GSD project — or import an existing folder as a GSD project — from the Dashboard with zero SSH and zero manual file edits. Includes GitHub repo creation on day one.
**Requirements:** NPC-01 through NPC-06 (satisfies deferred CREATE-01 from v4.x backlog)
**Depends on:** Phase 50.5
**Plans:** 4/4 plans complete
- [x] 51-01-PLAN.md — DB migration (creation_state), projectScaffold.js + projectDetector.js utilities, proxy prefix update
- [x] 51-02-PLAN.md — Backend route /api/projects (create, import, candidates, resume, github-pats) + server/index.js mount
- [x] 51-03-PLAN.md — UI: NewProjectDialog, ImportProjectDialog, ProjectProgressChip, Sidebar button wiring
- [x] 51-04-PLAN.md — UI: ProjectCreationCard + useProjectCreationState hook + ChatListView wiring

---

### Phase 53: Auto-Verify by Default

**Goal:** Every plan execution automatically runs verification before reporting complete. User sees one state transition ("working" → "done and tested"), not two.
**Requirements:** ATV-01 through ATV-05
**Depends on:** builds on `/gsd:verify-work` and Phase 48 idle detection
**Plans:** 4 plans

Plans:
- [x] 53-01-PLAN.md — verifyOrchestrator engine (startVerify, runVerify, maybeStartVerify, isVerifying, circuit breaker)
- [x] 53-02-PLAN.md — VerifyBadge UI component
- [x] 53-03-PLAN.md — Wire verifyOrchestrator into stateBroadcaster, idleDetector, and route handlers
- [x] 53-04-PLAN.md — Gap closure: client types/API wiring + DB migration for project_verify_state

---

### Phase 54: Global Env Editor

**Goal:** Make `/home/services/.env.production` viewable and directly editable from the Dashboard UI. Key=value editor with save. Replaces the original guided-onboarding scope — credentials are already managed in the global env manually; this just brings that workflow into the Dashboard.
**Requirements:** APO-01 (view), APO-02 (edit/save)
**Depends on:** Phase 51
**Plans:** 2 plans

Plans:
**Wave 1**
- [x] 54-01-PLAN.md — Backend API: GET /api/env + PUT /api/env (atomic write, path-traversal-safe)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 54-02-PLAN.md — Frontend: EnvEditorPage + EnvTable + Sidebar nav + App.tsx route

---

### Phase 56: CLI Verbosity Contract + Portfolio Feed

**Goal:** Reduce how much Claude/GSD says in the terminal so the fully-visible tmux pane is pleasant to watch. Extract landmark events from terminal output for surfacing in the Dashboard surround, without replacing the CLI itself.
**Requirements:** NAR-01 through NAR-05
**Depends on:** Phase 43 (project state broadcaster — already shipped)
**Plans:** TBD

---

### Phase 56B: Non-Programmer Behavioural Contract

**Goal:** Claude Code and GSD, by default for every project, never ask the user to perform a programmer action that Claude can do itself. Technical decisions are made by Claude using its own judgment, documented in the session report, and reversible by the user in plain English. Terminal stays raw — interpretation happens via behaviour, not output rewriting.
**Forbidden → replacement behaviours:**
| Forbidden | Replacement |
|-----------|-------------|
| Asking user to open/view/read code | Read it yourself; summarise in plain English |
| Asking user to paste git diffs or logs | Read them yourself |
| Asking user to edit a config/.env/any file | Edit it yourself; use the Global Env Editor (Phase 54) if credentials are missing |
| Asking user to run a terminal command | Run it yourself |
| "Deploy started, check back in a few minutes" | Run the deploy, wait for it, verify it's live, then ping the user |
| Asking user to run the tests | Run them yourself; only report after they pass (or after a real failure needing a decision) |
| Asking user a technical architecture decision in jargon | Decide yourself; state decision in plain English; offer to change course |
| Asking user to review code before commit | Commit yourself after verify-work passes (Phase 53) |
| "You'll need to do X manually after this finishes" | Don't finish until X is done, or add X to the plan |
| "I'll leave this for you to configure" | Configure with sensible default; document in session report |
| Technical disambiguation questions mid-plan | Use CLAUDE.md defaults; only escalate if truly stuck, framed in user terms |
**Requirements:** NPB-01 through NPB-07
**Depends on:** Phase 54 (global env editor), Phase 56 (verbosity contract it builds on)
**Plans:** TBD

---

### Phase 58: Project Maturity Stages

**Goal:** Every project has a `stage` field (`draft` | `alpha` | `beta` | `launched` | `maintenance` | `retired`) with stage-appropriate Dashboard defaults and a GUI-driven transition flow between adjacent stages.
**Stage matrix:**
| Stage | Meaning | GitHub | Tasks | Deploy | UI emphasis |
|-------|---------|--------|-------|--------|-------------|
| Draft | Idea exploring, might get killed | Private (backup only) | Dashboard | None | "Keep iterating" — chat + preview |
| Alpha | Real structure, single env, single user | Private, main only | Dashboard | Single preview URL | Add "Deploy preview" action |
| Beta | Shared with ≥1 outsider | Private (public optional) | Dashboard | Single preview, shareable | Surface preview URL, feedback intake |
| Launched | Real users / real reliance | Public or private, branch workflow | GitHub Issues | Dev + Production, promotion-gated | Dev + Prod URLs, Promote button, Issues view |
| Maintenance | Live but low velocity | Same as Launched | GitHub Issues | Same | Lower weight; surface only bugs & critical items |
| Retired | Not touched | Archived on GitHub | Closed/migrated | Paused or torn down | Archived, tmux stopped |
**Requirements:** MAT-01 through MAT-08
**Depends on:** Phase 51, Phase 54
**Plans:** TBD

---

### Phase 54B: Unified Notification Centre

**Goal:** Replace per-tmux Telegram output with a single Dashboard-owned notification service. The Dashboard decides what's worth notifying about, enforces per-project and global policies, and delivers via Telegram. Architectural shift: tmux session → Telegram (many senders, no filter) → Dashboard event bus → NotificationCentre → delivery channels (one sender, policy-filtered).
**Default event policy:**
| Event | Default | Rationale |
|-------|---------|-----------|
| Session waiting for user input | On | The thing you actually need to know |
| Plan/phase completed | On | Portfolio-level milestone |
| Verify-work failed | On | Requires a decision |
| Verify-work passed (after retry) | Off | Success is expected |
| Idle session auto-closed (Phase 48) | On | Cost-relevant |
| External service cost anomaly | On | Cost-relevant |
| New external GitHub Issue filed (Launched only) | On | Needs triage |
| Session started | Off | You started it |
| Individual tool-use events | Off (permanent) | Current noise source |
| Claude finished responding (per turn) | Off | Intra-session |
**Requirements:** NTF-01 through NTF-05
**Depends on:** Phase 42 (existing Telegram infra to refactor), Phase 43 (state broadcaster as event source), Phase 58 (stage-aware policies)
**Plans:** TBD

---

### Phase 59: Task Backend Migration + Basic Issue GUI Wrapper

**Goal:** When a project transitions Beta → Launched, its task backlog migrates to GitHub Issues, and all subsequent task reads/writes go through a Dashboard-native GUI wrapping GitHub Issues. GitHub's web UI is never needed for day-to-day issue work.
**Requirements:** TSK-01 through TSK-09
**Depends on:** Phase 54, Phase 58
**Plans:** TBD

---

### Phase 60: Dev/Production Environment Manager

**Goal:** Launched projects get provisioned dev + production environments automatically during Beta→Launched transition, with a GUI-driven "Promote dev → prod" action that enforces verify-work passing and documents the change. Railway-first provisioning.
**Requirements:** ENV-01 through ENV-05
**Depends on:** Phase 54, Phase 58
**Plans:** TBD

---

## Milestone-Level Success Test (v5.1)

At the end of v5.1, a non-programmer should be able to use the GSD Dashboard to:

1. Create a brand-new project (with GitHub repo) from the New Project wizard
2. Build it using the tmux terminal and project surround — no manual file editing, no paste-in of diffs or logs, no technical decisions framed in jargon
3. Watch it progress from Draft → Alpha → Beta as they iterate, receiving Telegram notifications filtered by policy (not a firehose)
4. Launch it to production, triggering dev + prod environment provisioning
5. Receive and respond to GitHub Issues on the launched project entirely through the Dashboard GUI
6. Promote changes from dev → prod with a single approval click

Verifiable by walking a non-programmer (Emily-Kate or equivalent) through the full flow end-to-end.

---

## Out of Scope for v5.1

| Item | Reason |
|------|--------|
| Natural-language action bar routing `/gsd:*` commands | Terminal already does this; wrapping a natural-language interface inside another adds no value |
| "Describe what's wrong" dispatcher at Dashboard level | `/gsd:debug` in tmux is the existing answer |
| Full issue lifecycle / Kanban stage board | Deferred to Phase 61 in v5.1 — Phase 59 delivers enough to launch real projects |
| External-reporter inbox + auto-promotion on merged PRs | Deferred to Phase 61 |
| Migrating the Dashboard itself to Launched | First real-world test of migration is PRC/KidAI in v5.0; Dashboard is dogfooded in v5.1 |
| Reply-from-Telegram | Dashboard is already usable on mobile; tap deep link → respond in Dashboard |
| Other notification delivery channels (email, SMS, Discord, push) | Single-user tool; Telegram is enough |
| Multi-user auth / RBAC beyond today's cookie auth | Still single-user |
| Mobile-specific UI redesign | Keep current responsive layout |
| Visual programming / flowchart UX | Natural-language-first is the bet |
| Anthropic subscription proxy (à la Meridian) | Separate concern |
| Autopilot cost gate (COST-05) | Follow-up for v5.1 |

---

## Backlog Folded into v5.0

- **Task #49** (Railway cost from RAM) — addressed indirectly via Phase 48 idle controls (shipped) and Phase 60 env-level cost visibility
- **Task #55** (switch autopilot to jamoeight fork) — decision stands: selective integration of failure propagation + circuit breaker in Phase 53, not a wholesale switch
- **Task #56** (project status slow/inaccurate) — shipped in Phase 43
- **Task #68** (change Pause/Archive workflow) — folded into Phase 53
- **Task #78** (Send button Enter key) — shipped in quick task #47
- **Task #82** (white/day theme contrast) — parked as SEED-002
- **Task #84** (CONTEXT.md re-ask) — addressed by Phase 56 verbosity contract
- **Phase 46** (Services API Integrations, v4.3) — subsumed by Phase 54
- **Phase 47** (AI-Guided CLAUDE.md Editor, v4.3) — parked as SEED-001

### Phase 52: GSD Command Discoverability

**Goal:** Make the GSD command toolkit discoverable through natural conversation (CLAUDE.md guidance) and one-tap chip buttons on mobile (Dashboard UI). Two parallel deliverables: CLAUDE.md natural-language → command mapping table; /gsd-next shortcut chip wired into the terminal panel.
**Requirements**: GSD Command Discoverability — CLAUDE.md guidance + /gsd-next UI button
**Depends on:** Phase 51
**Plans:** 2/2 plans complete

Plans:
- [x] 52-01-PLAN.md — Add GSD Command Suggestions section to CLAUDE.md (NL → /gsd-* mapping table)
- [x] 52-02-PLAN.md — Add /gsd-next to GSD_CHIPS and render CommandChips in TerminalOverlay (GSD.tsx)

---

<details>
<summary>✅ v5.0 Hetzner Migration (Phases 62, 67–72) — SHIPPED 2026-05-08</summary>

### Phase 62: Hetzner VPS Migration

**Goal:** Shut down Railway entirely — migrate all services to Hetzner CAX21 ARM VPS (~€5/month), configure Cloudflare Tunnel with gsdlabs.dev subdomains, cancel Railway. Reduced monthly infra bill from ~$127 to ~€5.
**Depends on:** Independent
**Plans:** 10/11 (62-09 superseded by 62-09b)

- [x] 62-01-PLAN.md — VPS bootstrap: OS, Docker, PM2, cloudflared, directory layout, secrets (.env.production)
- [x] 62-02-PLAN.md — Cloudflare named tunnel + gsdlabs.dev ingress rules
- [x] 62-03-PLAN.md — Reforma PostgreSQL migration: dump Railway, restore on VPS, update Vercel DATABASE_URL
- [x] 62-04-PLAN.md — GSD Dashboard lift-and-shift: clone to VPS, PM2 setup, verify dashboard.gsdlabs.dev
- [x] 62-05-PLAN.md — Debates Docker deploy; verify debates.gsdlabs.dev
- [x] 62-06-PLAN.md — Ynab Next.js + PostgreSQL migration; verify ynab.gsdlabs.dev
- [x] 62-07-PLAN.md — KidAI admin + image-search-mcp + PostgreSQL + VPS crontab; verify kidai.gsdlabs.dev
- [x] 62-08-PLAN.md — PostgreSQL backup container: nightly pg_dump → Backblaze B2 (30-day retention)
- [x] 62-09b-PLAN.md — Claude CLI + GSD workspace migration to VPS; parallel run validated; user sign-off
- [x] 62-10-PLAN.md — Railway teardown: account deleted 2026-05-08; tunnel.sh cleaned up

---

### Phase 67: Cockpit VPS Monitoring

**Goal:** Browser-accessible server admin UI at cockpit.gsdlabs.dev (CPU, RAM, disk, processes, systemd, journal).
**Depends on:** Phase 62 | **Plans:** 1/1

- [x] 67-01-PLAN.md — Install Cockpit + expose via Cloudflare Tunnel remote API

---

### Phase 68: Portainer Docker UI

**Goal:** Docker container management at portainer.gsdlabs.dev (inspect, restart, log-tail from browser).
**Depends on:** Phase 62 | **Plans:** 1/1

- [x] 68-01-PLAN.md — Install Portainer CE + expose via Cloudflare Tunnel remote API

---

### Phase 69: VPS System Stats Page in GSD Dashboard

**Goal:** "Server" page in GSD Dashboard sidebar showing live CPU/RAM/disk/processes via `/api/system`.
**Depends on:** Phase 62 | **Plans:** 1/1

- [x] 69-01-PLAN.md — `/api/system` Express route + Server page in sidebar

---

### Phase 70: Hetzner Non-Root User

**Goal:** Create `claude` OS user; migrate PM2, Docker group, SSH keys, `/data/home` + `/home/services` ownership, Claude config; remove `isRoot` workaround from gsd.js. Verified 12/12 (2026-05-05).
**Depends on:** Phase 62 | **Plans:** 3/3

- [x] 70-01-PLAN.md — Create claude user, SSH, ownership transfer, Claude config migration
- [x] 70-02-PLAN.md — PM2 migration to claude, systemd pm2-claude.service, crontab migration
- [x] 70-03-PLAN.md — Remove hardcoded /root/ paths, delete 4 GitHub Actions workflows, remove isRoot from gsd.js

---

### Phase 71: CLAUDE.md-First Automation Refactor

**Goal:** Remove server-side tmux injection (auto-verify trigger, Autopilot auto-dispatch). Dashboard is passive observer; CLAUDE.md drives GSD workflow.
**Depends on:** Phase 53 | **Plans:** 2/2

- [x] 71-01-PLAN.md — Remove maybeStartVerify from stateBroadcaster; disable AutopilotManager auto-dispatch
- [x] 71-02-PLAN.md — Add verify-work rule to GSD CLAUDE.md template; add backstop to complete-milestone workflow

---

### Phase 72: Disk Full Prevention

**Goal:** Eliminate "disk full → SQLite write failure → 502" outage. Fix cloudflared double-logging, add pm2-logrotate, disk monitoring with Telegram alerts, WAL checkpoint, weekly pruning, runbook.
**Depends on:** Phase 62, Phase 69 | **Plans:** 5/5

- [x] 72-01-PLAN.md — Fix named-tunnel.sh: remove tee, add --loglevel warn, startup truncate guard
- [x] 72-02-PLAN.md — Install pm2-logrotate: max_size=20M, retain=3, compress=true, daily rotation
- [x] 72-03-PLAN.md — Disk monitoring + WAL checkpoint in maintenance sweep (server/index.js)
- [x] 72-04-PLAN.md — scripts/prune-old-data.js + weekly cron
- [x] 72-05-PLAN.md — docs/DISK-RUNBOOK.md: emergency procedure, rotation table, Hetzner resize steps

</details>

---

## Seeds (parked ideas that may surface in v5.x)

- **SEED-001** — AI-Guided CLAUDE.md Editor (former Phase 47; may surface if non-programmer mode needs a settings transparency surface)
- **SEED-002** — Light/day theme contrast bug (former task #82; surface during next UI audit)
- **SEED-003** — MCP Tool Router / per-project MCP scoping (former Phase 55; dropped because global .env already handles credential distribution — revisit if Claude starts failing to use external services correctly despite having the keys)
