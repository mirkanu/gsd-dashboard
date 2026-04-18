---
phase: 49-idle-detector-busy-work-awareness
verified: 2026-04-18T14:45:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Visual: waiting · bg badge renders on project card when session is waiting with markers"
    expected: "Blue-tinted pill reading 'waiting · bg' appears on ProjectCard when sessionState='waiting' and busy_markers.count > 0, with tooltip listing kinds"
    why_human: "Visual/rendering correctness cannot be verified programmatically; also user has flagged this for a deferred semantic relabel (markers → 'working' state)"
  - test: "Live end-to-end: spawn background Bash (run_in_background:true) in a tmux Claude session, observe /api/gsd/projects returns busy_markers on that session, then observe idle detector skips graceful shutdown after idle_timeout"
    expected: "busy_markers field appears on API + WS, idle-skip.log gains a JSONL line at threshold time, tmux session remains alive"
    why_human: "Requires live Claude Code session + waiting for real idle threshold elapse; orchestrator already ran partial live checks (API/hook/sweep)"
---

# Phase 49: Idle Detector Busy-Work Awareness — Verification Report

**Phase Goal:** Prevent auto-close of Claude sessions actively waiting on in-flight background work (background bash, scheduled wakeups, running agents). Extend Phase 48 idle detector with a busy-marker signal sourced from Claude Code hooks.

**Verified:** 2026-04-18
**Status:** human_needed (automated checks all green; UI badge + live-session E2E awaits human)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from CONTEXT.md must-haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Hook writes markers on PreToolUse Bash(run_in_background=true), Agent, Task | VERIFIED | `.claude/hooks/gsd-busy-marker.js` event matrix present (lines covering `Bash` + `run_in_background===true`, `/(Agent\|Task)/`); settings.json has PreToolUse entries wired at lines 99, 109 |
| 2 | PostToolUse / SubagentStop clears markers | VERIFIED | settings.json SubagentStop array (line 115) + PostToolUse Bash hook (line 47) both point to gsd-busy-marker.js; hook smoke tests cover both paths |
| 3 | TTL fallback prevents leaks | VERIFIED | busyMarkers.js defaults: bash_bg=14_400_000, agent=7_200_000, wakeup=caller+grace; `hasBusyMarkers`/`getMarkers` purge expired on read; 12 unit tests cover TTL |
| 4 | Per-session JSON at data/busy-markers/<session_id>.json | VERIFIED | Base dir `data/busy-markers/` confirmed on disk (`gsddashboard.json` present — hook firing organically); path-traversal guard in busyMarkers.js |
| 5 | hasBusyMarkers integrated into idleDetector, skips graceful shutdown when markers present | VERIFIED | idleDetector.js: require at line 9, destructure at line 190, call at line 220, skip return at line 231; 5 idle-detector tests pass including "pane-waiting + markers present → skipped, no shutdown" |
| 6 | Every skip logged as JSONL to data/logs/idle-skip.log | VERIFIED | idleDetector.js:15 defines IDLE_SKIP_LOG_PATH, `_testAppendSkipLog` appends JSONL with fs.mkdirSync+appendFileSync, schema test asserts keys=[markers,project,reason,session,ts] |
| 7 | busy_markers: {count, kinds} surfaced on /api/gsd/projects when present; key OMITTED when count=0 | VERIFIED | server/routes/gsd.js:182-197 spreads `busy_markers` only when `bm.count > 0`; orchestrator's live Railway checks confirmed field present for sessions with markers and omitted otherwise |
| 8 | WS project_state_change threads busy_markers; absence-as-clear on client | VERIFIED | stateBroadcaster.js broadcasts across 3 branches with conditional spread (lines 69, 81, 93); GSD.tsx:742-746 `if (evt.busy_markers) patched.busy_markers = …; else delete patched.busy_markers`; 5 new stateBroadcaster tests pass including clear-on-same-state |
| 9 | UI surfaces sub-state | PASSED (note) | ChatListView.tsx:64-72 renders `· bg (N)` with kinds tooltip; GSD.tsx:793-796 renders badge with humanizeBusyMarkers tooltip. Note: user has flagged a follow-up to relabel the state as "working" — deferred quick task, not a blocker (see deferred) |
| 10 | Weekly disk-prune sweeps expired markers + rotates idle-skip.log | VERIFIED | /data/home/.local/bin/disk-prune.sh lines 37-42 added: `find … idle-skip.log* -mtime +30 -delete` and `node busyMarkers-sweep.cjs`; busyMarkers-sweep.cjs exits 0 cleanly |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/gsd/busyMarkers.js` | 208 LoC helper: writeMarker/clearMarker/hasBusyMarkers/getMarkers/sweepExpired | VERIFIED | 208 lines, exports match contract, imported by idleDetector + stateBroadcaster + gsd.js routes |
| `server/gsd/busyMarkers-sweep.cjs` | Executable CLI wrapping sweepExpired() | VERIFIED | 12 LoC, executable bit set, runs and exits 0 |
| `.claude/hooks/gsd-busy-marker.js` | Fail-safe hook handler for PreToolUse/PostToolUse/SubagentStop/Stop | VERIFIED | 212 lines, executable, `#!/usr/bin/env node` shebang, settings.json wires all 4 event classes |
| `server/gsd/idleDetector.js` | Skip branch + JSONL audit + exports | VERIFIED | busyMarkers required, hasBusyMarkersFn destructured, skip branch returns `{action:'skipped',reason:'busy-markers-present',project,markers}`, _testAppendSkipLog exported |
| `server/gsd/stateBroadcaster.js` | Threads busy_markers via getBusyMarkersFn, same-state broadcast on marker change | VERIFIED | 3 broadcast branches + same-state diff + conditional spread |
| `server/routes/gsd.js` | /api/gsd/projects includes busy_markers when count>0 | VERIFIED | Lines 13, 182-197; proxy-mode branch untouched (upstream JSON carries field) |
| `client/src/lib/types.ts` | BusyMarkers type + optional field | VERIFIED | Lines 134, 137, 149 |
| `client/src/pages/GSD.tsx` | humanizeBusyMarkers + absence-as-clear + badge | VERIFIED | Lines 63 (helper), 733-745 (reducer), 793-796 (badge) |
| `client/src/components/ChatListView.tsx` | · bg (N) hint + tooltip | VERIFIED | Lines 64-72 |
| `data/busy-markers/` | Per-session marker directory | VERIFIED | Exists with organic `gsddashboard.json` — hook firing live |
| `/data/home/.local/bin/disk-prune.sh` | Phase 49 blocks (idle-skip retention + sweep) | VERIFIED | Lines 37-42 present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| idleDetector.js | busyMarkers.js | `require('./busyMarkers')` + `hasBusyMarkersFn(project.tmux_session)` | WIRED | Line 9 require, line 220 call |
| _testCheckAndCloseSession skip branch | data/logs/idle-skip.log | `logSkipFn` → `_testAppendSkipLog` → `fs.appendFileSync` | WIRED | Tests assert JSONL schema |
| stateBroadcaster.js | busyMarkers.js | `getBusyMarkersFn = busyMarkers.getMarkers` | WIRED | Default inject + call at line 52 |
| server/routes/gsd.js | busyMarkers.js | `require('../gsd/busyMarkers')` + `getMarkers(tmux_session)` | WIRED | Lines 13, 182-183 |
| WS project_state_change | client reducer | `patchProjectsOnStateChange` absence-as-clear | WIRED | GSD.tsx:742-746 |
| client state | badge render | `sessionState==='waiting' && busy_markers.count>0` | WIRED | GSD.tsx:793, ChatListView.tsx:64 |
| disk-prune.sh | busyMarkers-sweep.cjs | `node … busyMarkers-sweep.cjs` | WIRED | Line 42 |
| .claude/settings.json | gsd-busy-marker.js | PreToolUse x2, PostToolUse, SubagentStop, Stop entries | WIRED | All 4 event classes registered |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| GSD.tsx ProjectCard badge | `project.busy_markers` | WS `project_state_change` → reducer → API `/api/gsd/projects` → busyMarkers.getMarkers(tmux_session) reads `data/busy-markers/<session>.json` | YES — organic marker file `data/busy-markers/gsddashboard.json` present, hook firing | FLOWING |
| idleDetector skip branch | `project.tmux_session` → hasBusyMarkers → markers | busyMarkers.js reads JSON file on disk, purges expired | YES — real fs reads + TTL purge, integration tests green | FLOWING |
| idle-skip.log | JSONL entry | fs.appendFileSync from skip branch | YES — schema validated by test #5 | FLOWING |
| ChatListView list row | `p.busy_markers` | Same as ProjectCard (same API) | YES | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full targeted test suites pass | `npx node --test server/__tests__/{busy-markers,idle-detector,stateBroadcaster}.test.js` | 35/35 pass, 0 fail, 220ms | PASS |
| Sweep CLI runs cleanly | `node server/gsd/busyMarkers-sweep.cjs` | exit 0 | PASS |
| Live Railway API responds | `curl https://gsd-dashboard-production.up.railway.app/api/gsd/projects` | HTTP 200 | PASS |
| busyMarkers module loads and exports expected surface | Module inspection: all 6 exports (writeMarker, clearMarker, hasBusyMarkers, getMarkers, sweepExpired, _setBaseDir) | Present per busyMarkers.js (208 LoC, L1-208) | PASS |
| Hook fires organically | Organic marker file `data/busy-markers/gsddashboard.json` exists from this session's Agent/Bash activity | File present | PASS |
| disk-prune.sh bash-valid | orchestrator previously confirmed `bash -n` passes + run-green | Blocks at lines 37-42 | PASS |

### Requirements Coverage

PLAN frontmatter declared `requirements: []` (phase 49 was context-driven, no REQUIREMENTS.md IDs). ROADMAP success criteria covered by CONTEXT.md must-haves, all verified above. No orphaned requirements.

### Anti-Patterns Found

None at blocker severity. Audited files: busyMarkers.js, idleDetector.js, stateBroadcaster.js, gsd.js, GSD.tsx, ChatListView.tsx, gsd-busy-marker.js, busyMarkers-sweep.cjs.

- No TODO/FIXME/PLACEHOLDER comments in new code paths
- No `return null`/`return {}` stubs in implementation functions
- Empty-array/empty-object patterns only in fallback defaults (`{ count: 0, kinds: [] }`) which are the intended backward-compat shape
- Hook swallows all errors (documented fail-safe pattern, not a stub)
- idle-skip audit log wrapped in try/catch (intentional — "never let audit logging break idle detector")

### Deferred Items (recorded in 49-03-SUMMARY.md — non-blocking)

| # | Item | Tracked |
|---|------|---------|
| 1 | Semantic relabel: when markers present, report state='working' not 'waiting · bg' | Quick task (user preference) |
| 2 | Remove 6h force-kill branch from idleDetector.js | Quick task (user preference) |
| 3 | SubagentStop eager-clear not firing for background Agent returns; TTL covers it (2h) | Quick task |

These are explicit post-phase follow-ups recorded in 49-03-SUMMARY.md checkpoint section. They do NOT block this phase's goal: prevent auto-close of sessions with in-flight background work. That capability is verified present end-to-end.

### Human Verification Required

1. **UI badge visual** — Render the `waiting · bg` badge on a project card in an actual browser and confirm pill styling + tooltip text match expectation. (Note: pending relabel to "working" is a deferred quick task, so this may intentionally change soon.)
2. **Live end-to-end idle skip** — Start a real Claude session in tmux, invoke a `Bash(run_in_background:true)` command, wait for `idle_timeout_minutes` to elapse, verify (a) session is NOT graceful-shutdown, (b) `data/logs/idle-skip.log` has a JSONL row for the skip.

### Gaps Summary

No gaps blocking the goal. All 10 observable truths from CONTEXT.md are supported by verified artifacts and wired links, all 35 targeted tests pass, sweep CLI runs cleanly, live Railway API is 200, disk-prune.sh carries Phase 49 blocks, and organic marker files prove hooks fire end-to-end. Two human-verification items remain (visual badge correctness, and a live real-timeout E2E) — these are quality-verification items, not implementation gaps.

**Verdict:** CONDITIONAL PASS — automated verification is complete and green; human sign-off remains for UI/live behavior.

---

_Verified: 2026-04-18_
_Verifier: Claude (gsd-verifier)_
