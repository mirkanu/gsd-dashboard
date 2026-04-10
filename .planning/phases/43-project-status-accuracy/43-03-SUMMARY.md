---
phase: 43-project-status-accuracy
plan: 03
subsystem: frontend-ui
tags: [websocket, react, elapsed, task-preview, chatlist, stat-01, stat-03, stat-04]

# Dependency graph
requires:
  - phase: 43-02
    provides: project_state_change WS broadcaster, /api/gsd/projects stateEnteredAt + currentTask fields
provides:
  - formatElapsed(startIso, nowMs) pure helper
  - GsdProject.stateEnteredAt + GsdProject.currentTask fields
  - ProjectStateChangeEvent type + WSMessage union 'project_state_change' variant
  - patchProjectsOnStateChange pure reducer (exported from GSD.tsx)
  - Live elapsed-time label + currentTask preview in ChatListView and ProjectCard
affects: [live Railway dashboard — STAT-01, STAT-03, STAT-04 observable end-to-end]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single useState<number>(nowMs) ticked every 1s for live-ticking elapsed labels — cheap React reconciliation across ~10 cards"
    - "Pure reducer pattern (patchProjectsOnStateChange) exported from a page component for unit testing without rendering"
    - "eventBus.subscribe for project_state_change — mirrors the existing autopilot_progress handler exactly"
    - "Reference-equal early return on unknown project name — avoids spurious re-renders"

key-files:
  created:
    - client/src/lib/__tests__/formatElapsed.test.ts
    - client/src/pages/__tests__/patchProjectsOnStateChange.test.ts
    - .planning/phases/43-project-status-accuracy/43-03-SUMMARY.md
  modified:
    - client/src/lib/types.ts
    - client/src/lib/format.ts
    - client/src/pages/GSD.tsx
    - client/src/components/ChatListView.tsx
    - client/src/pages/__tests__/GSD.filter.test.ts
    - client/dist/*

key-decisions:
  - "Updated ChatListView in addition to ProjectCard: the live UI path renders cards via ChatListView (wraps @chatscope Conversation) — ProjectCard in GSD.tsx is dead code kept in sync for parity. Without ChatListView the STAT-03/STAT-04 behaviors would not be visible to the user on Railway, so updating it is a Rule-3 blocking fix not a Rule-4 architectural change."
  - "Single nowMs useState incremented by a 1s setInterval, passed down as prop. Alternative (per-card interval or context) would be more complex for zero real benefit at ~10 cards."
  - "patchProjectsOnStateChange returns the input array by reference on unknown-project — keeps React from re-rendering when the server broadcasts for a project the client has not loaded yet (e.g. a new project added after first fetch, before the next poll seeds it)."
  - "ChatListView info line uses format '<State> <elapsed> · <currentTask>' — single text line fits the existing chatscope Conversation component without layout changes (preserves UI hierarchy per frontend-react.md)."
  - "ProjectCard export added to satisfy TS6133 after importing formatElapsed and ProjectStateChangeEvent — avoids reviving a dead-code warning that pre-existed this plan."

patterns-established:
  - "Any future WS push-driven UI update: (1) add variant to WSMessage union, (2) write pure reducer, (3) unit-test reducer, (4) subscribe in GSD.tsx via eventBus, (5) setProjects((prev) => reducer(prev, evt))"

requirements-completed: [STAT-01, STAT-03, STAT-04]

# Metrics
duration: ~13min
completed: 2026-04-10
---

# Phase 43 Plan 03: Project Status UI Wire-up Summary

**Client now subscribes to the Plan 02 `project_state_change` WebSocket broadcast, patches cards in place without a refetch, ticks elapsed time once per second, and renders the tmux-derived `currentTask` preview on every non-archived row — closing Phase 43's STAT-01/STAT-03/STAT-04 loop on the live Railway dashboard.**

## Performance

- **Duration:** ~13 min
- **Completed:** 2026-04-10
- **Tasks executed:** 3 (Tasks 1-3); Task 4 is a checkpoint:human-verify
- **Files created:** 2 (tests) + this SUMMARY
- **Files modified:** 5 source + client/dist
- **New tests:** 10 (8 for formatElapsed, 2 for patchProjectsOnStateChange)
- **Test results:** 132 total client tests → 130 pass, 2 pre-existing Sidebar failures (out of scope, carried deferred)

## Accomplishments

- **`formatElapsed(startIso, nowMs)` pure helper** in `client/src/lib/format.ts`. Handles null, invalid ISO, zero, sub-minute (`Ns`), sub-hour (`Nm Ns`), hourly (`Nh Mm` drops seconds), and negative clamp. Eight unit tests — all green.
- **Type extensions** in `client/src/lib/types.ts`:
  - `GsdProject.stateEnteredAt: string | null`
  - `GsdProject.currentTask: string | null`
  - `ProjectStateChangeEvent` interface (matches Plan 02 broadcaster payload)
  - `WSMessage.type` union extended with `'project_state_change'`
  - `WSMessage.data` union extended with `ProjectStateChangeEvent`
- **`patchProjectsOnStateChange` pure reducer** exported from `client/src/pages/GSD.tsx`. Patch-in-place for matching project, reference-equal no-op for unknown project. Two unit tests green.
- **WebSocket subscription** via `eventBus.subscribe` for `project_state_change` messages — mirrors the existing `autopilot_progress` handler line-for-line. No HTTP refetch on push.
- **1s nowMs tick** — single useState<number> incremented by setInterval, passed into both `ChatListView` call sites.
- **`ChatListView` updated** to render `'<State> <elapsed> · <currentTask>'` in the Conversation info line, falling back to `statusText` → `capitalize(sessionState)` when `currentTask` is null. Preserves the existing chatscope layout — additive text change only.
- **`ProjectCard` updated in parallel** (dead code in the live path, but kept in sync per plan): elapsed label inline next to the state label, currentTask preview line below the phase block. Gated on `stateEnteredAt` presence and non-archived state.
- **Client rebuilt** (`client/dist/assets/index-CShCEBto.js`) and committed — Railway build step is a no-op alias, so dist must be committed.
- **Deployed to Railway** via `railway up --detach`. Waited for the new bundle hash (`index-CShCEBto.js`) to go live; confirmed `HTTP/2 200`.

## Task Commits

1. **Task 1: formatElapsed + types (TDD)** — `7ebc077` (feat, RED→GREEN in a single commit after types landed)
2. **Task 2: WS handler + 1s tick + card rendering** — `2e82805` (feat, includes ChatListView update and dist rebuild)
3. **Task 3: Push + Railway deploy** — (no separate commit; push + `railway up --detach`)

## Files Created/Modified

- **`client/src/lib/format.ts`** — added `formatElapsed` (20 lines).
- **`client/src/lib/types.ts`** — extended `GsdProject` (+2 fields), added `ProjectStateChangeEvent`, extended `WSMessage` union.
- **`client/src/pages/GSD.tsx`** — imported `formatElapsed` and `ProjectStateChangeEvent`, added exported `patchProjectsOnStateChange` reducer, added `useEffect` subscribing to eventBus for `project_state_change`, added `nowMs` state + 1s tick, passed `nowMs` into both `<ChatListView>` call sites, updated exported `ProjectCard` to accept `nowMs` + render elapsed label + currentTask preview.
- **`client/src/components/ChatListView.tsx`** — added `nowMs?: number` prop, imported `formatElapsed`, composed Conversation info line as `'<State> <elapsed> · <currentTask>'`.
- **`client/src/pages/__tests__/GSD.filter.test.ts`** — fixture updated with the two new required fields (Rule 3 fix — blocking TS error from type extension).
- **`client/src/lib/__tests__/formatElapsed.test.ts`** *(created)* — 8 tests.
- **`client/src/pages/__tests__/patchProjectsOnStateChange.test.ts`** *(created)* — 2 tests.
- **`client/dist/*`** — rebuilt bundles committed for Railway.

## Decisions Made

See `key-decisions` in frontmatter. Summary:

1. **ChatListView must be updated alongside ProjectCard** — the live code path renders through `ChatListView` wrapping `@chatscope/chat-ui-kit-react`'s `Conversation`, not `ProjectCard`. ProjectCard is kept in sync for parity but is currently dead code at the render level. Without the ChatListView edit the user would see no STAT-03/STAT-04 effect on Railway — so updating it is a Rule-3 blocking deviation, not a Rule-4 architectural ask.
2. **Single nowMs useState** in the page component — cheap React reconciliation across ~10 cards. Per-card intervals or context would add complexity for no gain.
3. **Reference-equal no-op** for unknown project names in the reducer — avoids spurious re-renders when the broadcaster pushes for a project the client hasn't loaded yet (e.g. cold-boot race before the first `/api/gsd/projects` settles).
4. **Info-line composition in ChatListView** uses a single text string rather than adding a new DOM element — preserves the existing `@chatscope` layout exactly (frontend-react.md "preserve existing UI information hierarchy").
5. **ProjectCard export** — adding `export` in front of `function ProjectCard` silences the pre-existing TS6133 `declared but value is never read` warning once we start importing `formatElapsed` into the same file. Alternative (delete ProjectCard) would be a bigger diff.

## Deviations from Plan

### Rule 3 — Blocking fix: update ChatListView in addition to ProjectCard

- **Found during:** Task 2, while tracing how cards actually render.
- **Issue:** The plan's Task 2 action only touches `ProjectCard` in `GSD.tsx`, but `ProjectCard` is not rendered anywhere in the live UI path — both the desktop 3-column layout and the mobile layout render the project list through `<ChatListView>` (`client/src/components/ChatListView.tsx`), which wraps `@chatscope/chat-ui-kit-react`'s `Conversation` component. If I only updated `ProjectCard`, the user would see zero visible effect on Railway and the STAT-03/STAT-04 success criteria would fail at the checkpoint.
- **Fix:** Applied the live elapsed label and `currentTask` preview to `ChatListView` as well, composing a single info line (`'<State> <elapsed> · <currentTask>'`) that fits the existing `Conversation` component without any DOM/layout restructuring. Also updated `ProjectCard` per the plan, kept in sync for future parity.
- **Files modified:** `client/src/components/ChatListView.tsx`, `client/src/pages/GSD.tsx` (both ChatListView call sites now receive `nowMs`).
- **Commit:** `2e82805`.

### Rule 3 — Blocking fix: GSD.filter.test.ts fixture missing required fields

- **Found during:** Task 1 typecheck after extending `GsdProject`.
- **Issue:** `src/pages/__tests__/GSD.filter.test.ts` `makeProject` helper omitted the two new required fields (`stateEnteredAt`, `currentTask`), causing `TS2739` errors.
- **Fix:** Added the two fields to the fixture (both `null`).
- **Files modified:** `client/src/pages/__tests__/GSD.filter.test.ts`.
- **Commit:** `7ebc077` (rolled into Task 1).

No Rule 1 bugs or Rule 4 architectural asks.

## Verification

- **Targeted tests:**
  - `vitest run formatElapsed` → **8/8 pass**
  - `vitest run patchProjectsOnStateChange` → **2/2 pass**
- **Full client suite:** `npm run test:client` → **130/132 pass**. The 2 failures are in `src/components/__tests__/Sidebar.test.tsx` (`should show version number` + 1 other) — **pre-existing**, confirmed by a stash-and-rerun. Not caused by this plan. Carried forward from Phase 43-01/43-02 deferred list.
- **Targeted server tests:** `node --test server/__tests__/tmux.test.js server/__tests__/stateBroadcaster.test.js` → **37/37 pass** (no regression in Plans 01 + 02 primitives this plan depends on).
- **Full `npm run test:server` NOT run** — `autopilotManager.test.js` still hangs (pre-existing, documented in 43-01 and 43-02). Will need a dedicated quick task to unblock.
- **TypeScript:** `npx tsc --noEmit` passes for all new code. Pre-existing touchmove errors in `GSD.tsx` (lines ~506, 534, 535) and pre-existing `ProjectCard` TS6133 (now resolved by the export) are unchanged.
- **Client build:** `cd client && npm run build` → success, 2022 modules, new bundle `index-CShCEBto.js`.
- **Railway deploy:** `railway up --detach` issued; polled the live URL until the new bundle hash `index-CShCEBto.js` replaced the previous `index-Cw8z5e8s.js`. Confirmed on try 5 (~75s after push). `curl -sfI https://gsd-dashboard-production.up.railway.app/` → `HTTP/2 200`.

## Issues Encountered

- Pre-existing Sidebar test failures (2) — not caused by this plan.
- Pre-existing `autopilotManager.test.js` hang — blocks full server suite.
- Pre-existing touchmove-listener TS errors in `GSD.tsx` — unrelated to this plan's edits.

## Deferred Issues

- Sidebar test failures (x2) — candidates for a future quick task.
- `autopilotManager.test.js` hang — carried from 43-01/43-02.
- Touchmove TS errors in `GSD.tsx` — pre-existing, unrelated.

## Checkpoint Outcome

Task 4 is a `checkpoint:human-verify` — awaiting user confirmation on the live Railway URL. See the CHECKPOINT REACHED section in the execution response for exact verification steps. The phase is NOT yet closed; final status pending user approval.

## Self-Check

**File existence:**

- `client/src/lib/format.ts` — contains `formatElapsed` export (verified via Edit success).
- `client/src/lib/types.ts` — contains `GsdProject.stateEnteredAt`, `GsdProject.currentTask`, `ProjectStateChangeEvent`, `'project_state_change'` variant.
- `client/src/lib/__tests__/formatElapsed.test.ts` — created.
- `client/src/pages/__tests__/patchProjectsOnStateChange.test.ts` — created.
- `client/src/pages/GSD.tsx` — `patchProjectsOnStateChange` exported, eventBus subscription for `project_state_change`, `nowMs` state + tick, `ChatListView` call sites updated.
- `client/src/components/ChatListView.tsx` — `nowMs` prop, `formatElapsed` imported, info line composed.
- `.planning/phases/43-project-status-accuracy/43-03-SUMMARY.md` — this file.

**Commit existence:**

- `7ebc077` — Task 1 (feat(43-03): add formatElapsed + stateEnteredAt/currentTask types).
- `2e82805` — Task 2 (feat(43-03): wire project_state_change WS + live elapsed + task preview).

**Deployment:**

- New bundle `index-CShCEBto.js` confirmed live on `https://gsd-dashboard-production.up.railway.app/`.
- `HTTP/2 200` returned.

## Self-Check: PASSED

---
*Phase: 43-project-status-accuracy*
*Completed: 2026-04-10 (execution) — awaiting human verification*
