# Phase 58: Project Maturity Stages - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `stage` field to every project (`draft` | `alpha` | `beta` | `launched` | `maintenance` | `retired`) stored in `gsd-projects.json`. Stage drives: card UI defaults, a guided transition wizard with prerequisite gates, auto-provisioning of monitoring (BetterStack) and backup (R2) at the Beta→Launched gate, a stage-grouping view on the Dashboard, a two-tier kill/archive flow for Draft projects, and Dashboard nudges when eligibility criteria are met.

</domain>

<decisions>
## Implementation Decisions

### Stage Storage (MAT-01)
- **D-01:** `stage` field lives in `gsd-projects.json` alongside `name`/`root`. Single source of truth; works even when `.planning/` does not exist. Defaults to `"draft"` at project creation.

### Stage Transition Gates (MAT-03, MAT-04)
- **D-02:** All transitions are reversible in both directions. Beta ↔ Launched is the only one with data migration (Dashboard tasks → GitHub Issues).
- **D-03:** Gate matrix:
  | Transition | Hard gates |
  |-----------|-----------|
  | Draft → Alpha | Project name set |
  | Alpha → Beta | (soft) Preview/deploy URL set — wizard warns but doesn't block |
  | Beta → Launched | Production URL set, BetterStack monitor ✓, R2 backup ✓, GitHub Issues enabled |
  | Launched → Maintenance | None — confirmation only |
  | Any → Retired | Confirmation dialog with teardown checklist |
- **D-04:** For Alpha→Beta the preview URL check is a soft recommendation (no blocking) because some projects — CLI tools, libraries — may not have a web URL.
- **D-05:** No platform assumptions for deploy/preview URLs (e.g., no Railway mentions). URLs are free-form fields the user sets.

### BetterStack + R2 Auto-Provisioning (MAT-03, MAT-05)
- **D-06:** When Beta→Launched transition wizard finds BetterStack monitor or R2 bucket missing, it **auto-provisions** them using global env keys (`BETTERSTACK_API_KEY`, `CLOUDFLARE_API_KEY`/`CLOUDFLARE_EMAIL`). User does not need to set these up manually — same pattern as the existing GitHub repo creation in the project pipeline.
- **D-07:** These are hard gates at Beta→Launched only — not earlier stages.

### Card UI Per Stage (MAT-02)
- **D-08:** Stage sets the default for which task surface appears (Dashboard tasks for Draft/Alpha/Beta; GitHub Issues for Launched/Maintenance). The project's Config tab allows a per-project override.
- **D-09:** Card variations by stage: Draft shows kill/archive button; Launched shows Dev + Prod URLs and Promote button; Maintenance shows lower visual weight with only bug/critical items surfaced.

### Stage Grouping View on Dashboard (MAT-02)
- **D-10:** Dashboard left panel gets a "Group by" toggle: **State** (existing: Waiting/Working/Paused tabs) vs **Stage** (Draft/Alpha/Beta/Launched/Maintenance/Retired).
- **D-11:** In Stage mode: same project cards as today, grouped under section headers (e.g., "🟢 Beta (3)", "🚀 Launched (2)"). No new card layout in this phase.
- **D-12:** `/kanban` route stays dormant (redirect to `/` unchanged). The grouping lives inside the existing Dashboard panel via `ChatListFilters`.

### Backfill Flow (MAT-06)
- **D-13:** Existing projects with no stage show an inline "Assign stage" chip on their card. No banner, no blocking startup flow. Chip disappears once a stage is assigned. Forces a conscious decision per project.

### Kill / Archive Flow (MAT-08)
- **D-14:** Two-tier flow for Draft projects:
  - **Archive:** Stops tmux, hides from active Dashboard view, keeps files + GitHub repo. Reversible (restore from settings).
  - **Full delete:** Requires typing `DELETE` to confirm. Destroys GitHub repo, `/data/home/[name]`, tmux session, and Dashboard entry. Irreversible.
- **D-15:** Kill/archive button only appears on Draft-stage projects.

### Retired Stage Behavior (MAT-05)
- **D-16:** Retiring a project: auto-pauses tmux (stops the session), auto-archives the GitHub repo via API, surfaces a checklist of what was torn down.
- **D-17:** Retired projects do not auto-start tmux — user must explicitly un-retire before any active session resumes.

### Stage Nudges (MAT-07)
- **D-18:** When eligibility criteria are met (e.g., Beta for 14 days with ≥12 commits), a nudge fires as both:
  - A Portfolio Feed event: "🚀 [project] has been in Beta for 14 days with 12 commits — ready to launch?" with a 'Start transition' link.
  - A card badge: "⬆ Ready to advance" — stays on the card until dismissed or transition completes.
- **D-19:** User always decides — nudge is a suggestion, never an automatic transition.

### Maintenance Stage Behavior
- **D-20:** When a project moves to Maintenance, non-critical notifications are silenced — only bug and critical-priority items surface. Feature nudges suppressed.

### Claude's Discretion
- Exact BetterStack API call shape for monitor creation (check existing `costMeasurement.js` for API patterns)
- R2 bucket naming convention per project
- Specific eligibility criteria formula for stage nudges (e.g., how "14 days + 12 commits" is tracked)
- Section header styling and emoji for stage groups on Dashboard
- Config tab UI for the task-surface override toggle

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §MAT — MAT-01 through MAT-08 (8 requirements for this phase)
- `.planning/ROADMAP.md` §Phase 58 — Stage matrix table and phase goal

### Existing Code — Storage & Config
- `gsd-projects.json` — project registry; `stage` field added here
- `server/routes/projects.js` — project creation/import pipeline; stage default added at registration

### Existing Code — UI Surfaces
- `client/src/components/ChatListFilters.tsx` — current Waiting/Working/Paused tab logic; "Group by" toggle added here
- `client/src/pages/Dashboard.tsx` — project list container; stage grouping wired here
- `client/src/components/ProjectDetailsPanel.tsx` — per-project details; stage badge + transition wizard entry point
- `client/src/components/ProjectControls.tsx` — action buttons; kill/archive button added here for Draft stage
- `client/src/components/board/KanbanBoard.tsx` — generic kanban primitive (parked, not used in this phase)

### Existing Code — Backend Services
- `server/gsd/proxyStateBroadcaster.js` — broadcasts project state; extend for stage change events
- `server/gsd/feedStore.js` — Portfolio Feed event store; stage nudge events written here
- `server/gsd/costMeasurement.js` — BetterStack API integration pattern to follow for monitor provisioning

### External APIs (auto-provisioning)
- BetterStack API key: `BETTERSTACK_API_KEY` (in `/home/services/.env.production`)
- Cloudflare R2: `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL` (in `/home/services/.env.production`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `KanbanBoard.tsx` — generic drag-enabled board primitive in `client/src/components/board/`. Parked for Phase 61; NOT used in Phase 58 (stage grouping is inside the existing panel, not a new board page).
- `ChatListFilters.tsx` — current filter tab component; extended with "Group by: State / Stage" toggle.
- Portfolio Feed (`feedStore.js`) — already stores landmark events; stage nudge events follow the same pattern.
- GitHub repo creation step in `server/routes/projects.js` — pattern for calling external APIs (GitHub PAT) during project lifecycle; BetterStack/R2 provisioning follows this pattern.

### Established Patterns
- Project config is stored in `gsd-projects.json` as a JSON array; each project has `{name, root, tmux_session, services[]}`. Stage field added as `"stage": "draft"` (default).
- External service API keys live in `/home/services/.env.production`; accessed via `getSecret()` helper in the server.
- Dashboard state tabs use `SessionState` type (`waiting` | `working` | `paused` | `archived`). Stage grouping is a parallel view mode, not a replacement.

### Integration Points
- `gsd-projects.json` write path: `server/routes/projects.js` handles create/import; stage transitions need a new `PATCH /api/projects/:name/stage` endpoint.
- Transition wizard: new React component, likely a modal/dialog, triggered from project card or `ProjectDetailsPanel`.
- Nudge eligibility check: server-side cron or event-driven check comparing `stage`, `updated_at`, and commit count from git.
- Backfill "Assign stage" chip: rendered in `ProjectCard` or `ChatListFilters` when `project.stage` is undefined/null.

</code_context>

<specifics>
## Specific Ideas

- **No Railway:** Deploy/preview URLs are free-form. Never suggest Railway as a platform — projects run on Hetzner. Existing Railway status entries in `gsd-projects.json` are a cleanup task (separate from Phase 58).
- **Stage matrix from ROADMAP:** The 6-stage matrix (Draft/Alpha/Beta/Launched/Maintenance/Retired) with the GitHub/Tasks/Deploy/UI columns is the source of truth — don't invent new stages.
- **Kill flow UX:** Two-tier is important — "Archive" is the common action (project is paused, not destroyed); "Full delete" requires `DELETE` typed in full. This avoids accidental destruction on mobile.
- **Backfill is per-card, not a modal:** Inline chip on each project card, no blocking flow. Keeps the Dashboard usable while backfill is in progress.

</specifics>

<deferred>
## Deferred Ideas

- **Drag-to-promote on Kanban view:** Dragging a project card to a new stage column triggers the wizard. Deferred to Phase 61 (Issue Lifecycle & Stage Management already references the KanbanBoard primitive).
- **Railway cleanup:** Remove Railway status entries from `gsd-projects.json` and server files. Separate quick task — not Phase 58.
- **Auto-promotion on merged PRs + green CI:** MAT-07 nudge only; full auto-promotion is Phase 61 scope.
- **Stage-aware card layouts:** Different card designs per stage (Launched showing dual URLs prominently, etc.) deferred. Phase 58 delivers grouping headers only; MAT-02 card variations are a Phase 58 stretch goal.

</deferred>

---

*Phase: 58-Project-Maturity-Stages*
*Context gathered: 2026-05-28*
