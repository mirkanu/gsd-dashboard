---
task: 260418-khw
title: Pivot busy-work semantics — markers flip state to 'working', drop force-kill, remove badge suffix, fix clear-path
type: quick
autonomous: true
created: 2026-04-18
---

# Objective

Post-Phase-49 follow-up. Three semantic pivots + one bug fix:

1. When a `waiting` session has busy markers, emit `state='working'` instead of `waiting · bg` — user mental model: "waiting" = needs human input.
2. Remove the 6h force-kill branch from `idleDetector.js` — user prefers manual intervention over auto-kill for stuck working sessions.
3. Drop the ` · bg` UI badge suffix now that state flips to `working` — tooltip still carries marker detail.
4. Fix the clear-path so completed background Agent calls have their markers eagerly cleared (currently two stale markers sit in `data/busy-markers/gsddashboard.json` because `PostToolUse` matching `Agent|Task` isn't registered).

# Tasks

## Task 1: stateBroadcaster relabel waiting+markers → working

File: `server/gsd/stateBroadcaster.js`

- After `markersInfo = getBusyMarkersFn(project.tmux_session)` and determining `busy_markers`, compute `effectiveState = (busy_markers && sessionState === 'waiting') ? 'working' : sessionState`.
- Use `effectiveState` in everything that gets STORED in snapshot AND everything BROADCAST. Leave raw-pane detection untouched; only the emitted/stored state changes.
- Keep `stateEnteredAt` semantics: a pane-detected state transition resets it; same-pane-state with marker appearance/clear keeps it.

Tests in `server/__tests__/stateBroadcaster.test.js`:

- (a) seed + poll with `detectFn=waiting` + markers present → first call no broadcast (seed), second call (same) still no broadcast (initial seed already captures markers — so instead: seed markers-absent then markers appear). Use the existing same-state broadcast-on-marker-change path to assert the emitted `sessionState==='working'`.
- (b) waiting + no markers → emitted state stays `waiting` unchanged.
- (c) working + markers → emitted stays `working`; no relabel-loop.
- (d) markers clear while pane is still `waiting` → re-emit with `sessionState==='waiting'`.

Commit: `feat(260418-khw): relabel waiting+busy_markers as working in state broadcaster`

## Task 2: Remove 6h force-kill branch from idleDetector.js

File: `server/gsd/idleDetector.js`

- Delete `_isStuckWorking`, `_forceKill`, `forceKillIfOverdue`, `FORCE_KILL_WORKING_THRESHOLD_MS`.
- Delete `forceKillFn`, `getCostFn`, `logCostFn` from `_testCheckAndCloseSession` fns destructure ONLY if the graceful-shutdown path below also doesn't use them. After inspection: `getCostFn` and `logCostFn` are also called in the graceful-shutdown path — KEEP those. Only remove `forceKillFn`.
- Replace the `if (state === 'working') { ... force-kill ... }` block with `if (state === 'working') return null;`.
- Drop `forceKillIfOverdue` from `module.exports`.
- Delete tests asserting `action:'force-killed'` or `reason:'stuck-working-6h'` in `server/__tests__/idle-detector.test.js`:
  - `test('force.kill: working session > 6h ...')` — delete.
  - `test('idle.busy-markers: pane-working → force-kill path ignores busy markers' ...)` — delete.
  - Remove `stuckWorking` branch + `forceKillFn` knob from the `_makeBusyFns` helper.
- Update the `require('../gsd/idleDetector')` destructure to drop `forceKillIfOverdue`.

Commit: `feat(260418-khw): remove 6h force-kill branch from idle detector`

## Task 3: UI — drop `· bg` suffix, keep tooltip

Files:
- `client/src/pages/GSD.tsx`: delete the `<span title=humanizeBusyMarkers…>waiting · bg</span>` element entirely. The state label already says "Working" thanks to Task 1. Keep `humanizeBusyMarkers` export (used for title on the ChatListView row), still used for tooltip via the existing label span.
  - Add `title={project.busy_markers ? humanizeBusyMarkers(project.busy_markers) : undefined}` to the stateConf.label span so tooltip still exists on hover.
- `client/src/components/ChatListView.tsx`: remove the ` · bg (N)` suffix from `info`. Keep the `title=` tooltip.
  - Simplify: `const info = baseInfo;` — drop the showBusyHint concatenation.
  - Keep `title={showBusyHint ? 'waiting · bg — …' : undefined}` but change the label text since state is now "Working" — tooltip becomes just `humanizeBusyMarkers(p.busy_markers)` or equivalent.

No test updates required (no existing tests assert on ` · bg`).

Commit: `feat(260418-khw): remove waiting · bg badge suffix (state now shows Working)`

## Task 4: Fix PostToolUse Agent|Task clear-path + test

Files: `.claude/settings.json`, `.claude/hooks/gsd-busy-marker.js`, `.claude/hooks/__tests__/gsd-busy-marker.test.js`

Root cause: `.claude/settings.json` registers `PostToolUse` for `Bash` only. Agent|Task completion has no hook wired. `SubagentStop` fires only for subagents' own Stop events and does not reliably carry the parent's `tool_use_id`.

Fix:
- Add a new `PostToolUse` matcher `Agent|Task` in `settings.json` pointing to `gsd-busy-marker.js`.
- In `gsd-busy-marker.js`, extend `PostToolUse` branch: if `toolName` matches `/^(Agent|Task)$/` and `toolUseId` is present → `safeClear(tmuxSession, toolUseId)`.

Test: `PostToolUse Agent with matching id → marker cleared (file deleted)` — pre-seed a PreToolUse Agent marker, fire PostToolUse Agent, assert file removed.

Then: clean up stale markers currently in `data/busy-markers/gsddashboard.json`. Since this session is live and running, we can't clear our OWN active marker, but the four stale agent markers from completed agent runs should go. Simplest: rewrite the file with just the currently active agent marker (the one for this very quick-task) or delete entirely and let the current active PreToolUse re-seed.

Commit: `fix(260418-khw): clear agent markers on PostToolUse(Agent|Task)`

## Task 5: Verification

- `npm run test:server` — all previously-passing tests still pass; no new failures. (Pre-existing failures in deferred-items.md OK.)
- `npm run test:client` — ensure no new failures for touched files.
- Manual spot-check locally via Bash `sqlite3` or `curl` against PM2 local after restart.
- Push + deploy to Railway.

# Success Criteria

- Touching sessions with busy markers now show `state='working'` in `/api/gsd/projects`.
- `forceKillIfOverdue` no longer exported; working sessions simply not auto-closed.
- UI: no ` · bg` text anywhere; tooltip still reveals marker kinds on hover.
- Hook: PostToolUse(Agent|Task) clears markers; new test passes.
- Stale gsddashboard markers file contains only currently-active markers.

# Non-goals

- No marker subsystem API changes.
- No WS message-type changes (the payload's `sessionState` value just differs for busy-waiting sessions — that's the intended semantic change).
- No schema changes.
