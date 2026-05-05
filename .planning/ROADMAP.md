# Roadmap: GSD Dashboard

**Current milestone:** v5.0 Non-Programmer Mode
**Created:** 2026-04-18
**Prior milestones:** archived to `.planning/milestones/` (v4.3 is the immediate predecessor)

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
| 50.5. Original-Repo Cleanup | 0/0 | Not planned | - |
| 51. GUI Project Creation + Import | 4/4 | Complete   | 2026-04-20 |
| 53. Auto-Verify by Default | 0/0 | Not planned | - |
| 54. Admin-API Onboarding for External Services | 0/0 | Not planned | - |
| 55. MCP Tool Router Evaluation (decision) | 0/0 | Not planned | - |
| 56. CLI Verbosity Contract + Portfolio Feed | 0/0 | Not planned | - |
| 56B. Non-Programmer Behavioural Contract | 0/0 | Not planned | - |
| 58. Project Maturity Stages | 0/0 | Not planned | - |
| 54B. Unified Notification Centre | 0/0 | Not planned | - |
| 59. Task Backend Migration + Issue GUI Wrapper | 0/0 | Not planned | - |
| 60. Dev/Production Environment Manager | 0/0 | Not planned | - |
| 62. Hetzner VPS Migration | 9/11 | In Progress|  |
| 67. Cockpit VPS Monitoring | 0/0 | Not planned | - |
| 68. Portainer Docker UI | 0/0 | Not planned | - |
| 69. VPS System Stats Page in GSD Dashboard | 0/0 | Not planned | - |
| 70. Hetzner Non-Root User | 0/3 | Planned | - |

---

## Execution Order (dependency graph)

```
50.5 (cleanup) ──→ 51 (project creation)
                   ├──→ 53 (auto-verify)
                   ├──→ 54 (admin APIs) ──→ 55 (MCP evaluation)
                   ├──→ 56 (verbosity + feed) ──→ 56B (behavioural contract)
                   └──→ 58 (maturity stages) ──┬──→ 54B (notification centre)
                                                ├──→ 59 (task migration + issue GUI)
                                                └──→ 60 (dev/prod envs)
```

Phase 56B depends on both 54 (admin APIs) and 56 (verbosity).
Phase 54B depends on 58 (stage-aware defaults) alongside the already-shipped Phase 43.

---

## Coverage (v5.0)

- v5.0 requirements: 64 total (see REQUIREMENTS.md)
- Mapped to phases: 64
- Unmapped: 0

| Phase | Requirements |
|-------|--------------|
| 50.5 | CLN-01, CLN-02, CLN-03, CLN-04, CLN-05, CLN-06 |
| 51 | NPC-01, NPC-02, NPC-03, NPC-04, NPC-05, NPC-06 |
| 53 | ATV-01, ATV-02, ATV-03, ATV-04, ATV-05 |
| 54 | APO-01, APO-02, APO-03, APO-04, APO-05, APO-06 |
| 55 | APO-07, APO-08 |
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
**Plans:** 4 plans
- [ ] 50.5-01-PLAN.md — CLN-01/02/03 client route + view + browser-notification deletions
- [ ] 50.5-02-PLAN.md — CLN-04 scripts/seed + import-history + statusline deletions
- [ ] 50.5-03-PLAN.md — CLN-05 route+schema audit and dead-table DROP
- [ ] 50.5-04-PLAN.md — CLN-06 Dockerfile/workflows + install-hooks rewrite + /api/settings changes

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
**Plans:** 03

Wave 2 *(blocked on Wave 1 completion)*
- Plan 03: Wire verifyOrchestrator into stateBroadcaster, idleDetector, and route handlers

---

### Phase 54: Admin-API Onboarding for External Services

**Goal:** When a project declares a dependency on GitHub / Vercel / Stripe / Resend / Railway / OpenAI / Anthropic / a chosen email service, the Dashboard walks the user through guided onboarding and stores credentials such that the project's Claude Code sessions can use them automatically. Railway-first service picker; third-party only when a genuine gap exists. Subsumes v4.3's Phase 46 scope.
**Requirements:** APO-01 through APO-06
**Depends on:** Phase 45 (credentials storage)
**Plans:** TBD

---

### Phase 55: MCP Tool Router Evaluation (decision phase)

**Goal:** Evaluate whether to use Composio's Tool Router, build a self-hosted MCP gateway, or wire per-service MCP servers individually, so Claude Code sessions get per-project MCP tools for external services automatically, scoped to that project's credentials.
**Checkpoint:** Build-vs-buy decision — produce a recommendation doc, not a full build.
**Requirements:** APO-07, APO-08
**Depends on:** Phase 54
**Plans:** TBD (small — research + decision doc)

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
| Asking user to edit a config/.env/any file | Edit it yourself; request credentials via Dashboard panel (Phase 54) if missing |
| Asking user to run a terminal command | Run it yourself |
| "Deploy started, check back in a few minutes" | Run the deploy, wait for it, verify it's live, then ping the user |
| Asking user to run the tests | Run them yourself; only report after they pass (or after a real failure needing a decision) |
| Asking user a technical architecture decision in jargon | Decide yourself; state decision in plain English; offer to change course |
| Asking user to review code before commit | Commit yourself after verify-work passes (Phase 53) |
| "You'll need to do X manually after this finishes" | Don't finish until X is done, or add X to the plan |
| "I'll leave this for you to configure" | Configure with sensible default; document in session report |
| Technical disambiguation questions mid-plan | Use CLAUDE.md defaults; only escalate if truly stuck, framed in user terms |
**Requirements:** NPB-01 through NPB-07
**Depends on:** Phase 54 (admin APIs for auto-setup), Phase 56 (verbosity contract it builds on)
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

## Milestone-Level Success Test

At the end of v5.0, a non-programmer should be able to use the GSD Dashboard to:

1. Create a brand-new project (with GitHub repo) from the New Project wizard
2. Build it using the tmux terminal and project surround — no manual file editing, no paste-in of diffs or logs, no technical decisions framed in jargon
3. Watch it progress from Draft → Alpha → Beta as they iterate, receiving Telegram notifications filtered by policy (not a firehose)
4. Launch it to production, triggering dev + prod environment provisioning
5. Receive and respond to GitHub Issues on the launched project entirely through the Dashboard GUI
6. Promote changes from dev → prod with a single approval click

Verifiable by walking a non-programmer (Emily-Kate or equivalent) through the full flow end-to-end.

---

## Out of Scope for v5.0

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

### Phase 52: GSD Command Discoverability — CLAUDE.md guidance for Claude to proactively suggest the best /gsd-* command for natural-language queries; add /gsd-next to dashboard shortcut buttons above the insert-into-tmux input

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 51
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 52 to break down)

---

### Phase 62: Hetzner VPS Migration — move all Railway services to self-hosted Hetzner CAX21 to eliminate ~$120/month in Railway costs

**Goal:** Shut down Railway entirely — migrate all active Railway services and the Claude CLI SSH host to a Hetzner CAX21 (8 GB ARM VPS, ~$8/month), verify full functionality on Hetzner, then cancel Railway to bring the monthly bill to ~$0. Configure Cloudflare Tunnel with gsdlabs.dev subdomains. Exceptions: reforma frontend stays on Vercel (not Railway); Josie is archived — delete from Railway, no migration needed. Reduces the monthly infrastructure bill from ~$127 to ~$8.

**Requirements**: Hetzner API token from user; Cloudflare credentials already available at /data/home/.env (CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL for gsdlabs.dev)
**Depends on:** Independent (can run in parallel with v5.0 phases)
**Plans:** 9/11 plans executed

Plans:
- [x] 62-01-PLAN.md — VPS bootstrap: OS, Docker, PM2, cloudflared, directory layout, secrets (.env.production)
- [x] 62-02-PLAN.md — Cloudflare named tunnel + gsdlabs.dev ingress rules; updated GSD Dashboard deploy workflow
- [x] 62-03-PLAN.md — Reforma PostgreSQL migration: dump Railway, restore into reforma-db container, update Vercel DATABASE_URL
- [x] 62-04-PLAN.md — GSD Dashboard lift-and-shift: clone to VPS, PM2 setup, verify dashboard.gsdlabs.dev
- [x] 62-05-PLAN.md — Debates Docker deploy + GitHub Actions workflow; verify debates.gsdlabs.dev
- [x] 62-06-PLAN.md — Ynab Next.js + PostgreSQL migration; verify ynab.gsdlabs.dev
- [x] 62-07-PLAN.md — KidAI admin + image-search-mcp + PostgreSQL migration + VPS crontab; verify kidai.gsdlabs.dev
- [x] 62-08-PLAN.md — PostgreSQL backup container: nightly pg_dump -> Backblaze B2 with 30-day retention
- [ ] 62-09-PLAN.md — Parallel run validation gate: 1-week health check sweep + user sign-off checkpoint
- [ ] 62-10-PLAN.md — Railway teardown + DNS cutover + tunnel.sh cleanup

---

---

### Phase 67: Cockpit VPS Monitoring

**Goal:** Install and expose Cockpit on the Hetzner VPS so there's a browser-accessible server admin UI at `VPS-IP:9090` showing CPU load, RAM, disk usage, running processes, systemd units, and journal logs — without needing SSH for routine health checks.
**Requirements:** TBD
**Depends on:** Phase 62 (Hetzner VPS up and running)
**Plans:** TBD (run /gsd-plan-phase 67 to break down)

---

### Phase 68: Portainer Docker UI

**Goal:** Install Portainer CE on the Hetzner VPS so all Docker containers can be inspected, restarted, and log-tailed from a browser — a Railway-like container management UI without the Railway price tag. Expose via Cloudflare Tunnel at `portainer.gsdlabs.dev`.
**Requirements:** TBD
**Depends on:** Phase 62 (Hetzner VPS + Docker + Cloudflare Tunnel)
**Plans:** TBD (run /gsd-plan-phase 68 to break down)

---

### Phase 69: VPS System Stats Page in GSD Dashboard

**Goal:** Add a "Server" page to the GSD Dashboard showing live VPS metrics — CPU load average, RAM (used/free/swap), disk usage per mount, and top processes by memory. Expose via a `/api/system` endpoint on the existing Express server; no new services required.
**Requirements:** TBD
**Depends on:** Phase 62 (GSD Dashboard running on Hetzner VPS)
**Plans:** TBD (run /gsd-plan-phase 69 to break down)

---

### Phase 70: Hetzner Non-Root User

**Goal:** Create a non-root `claude` OS user on the Hetzner VPS so Claude Code can run with `--dangerously-skip-permissions` (blocked for root by Claude Code 2.1.126+). Migrate PM2 processes, docker group membership, SSH authorized_keys, `/data/home` and `/home/services` ownership, global Claude settings, and crontabs to the new user. Remove the `isRoot` workaround from `server/routes/gsd.js`. Future SSH sessions target `claude@hetzner` instead of `root@hetzner`.
**Requirements:** TBD
**Depends on:** Phase 62 (Hetzner VPS running)
**Plans:** 3 plans
- [ ] 70-01-PLAN.md — create claude user + SSH + ownership transfer + Claude config migration
- [ ] 70-02-PLAN.md — PM2 migration to claude + systemd boot unit + crontab migration + tmux cleanup
- [ ] 70-03-PLAN.md — fix hardcoded /root/ paths in scripts + update 4 GitHub Actions workflows + remove isRoot from gsd.js

---

## Seeds (parked ideas that may surface in v5.x)

- **SEED-001** — AI-Guided CLAUDE.md Editor (former Phase 47; may surface if non-programmer mode needs a settings transparency surface)
- **SEED-002** — Light/day theme contrast bug (former task #82; surface during next UI audit)
