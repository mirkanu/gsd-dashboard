---
phase: 48-idle-session-cost-controls
verified: 2026-04-15T13:45:00Z
status: passed
score: 12/12 must-haves verified
---

# Phase 48: Idle Session Cost Controls Verification Report

**Phase Goal:** Measure actual per-tmux RSS and Railway $/day cost estimates (surfaced in Services/Usage UI), detect idle Claude sessions, and auto-close them via `/gsd:pause-work` handoff + tmux termination. Config UI for thresholds.

**Verified:** 2026-04-15T13:45:00Z

**Status:** PASSED — All observable truths verified. Goal achieved.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | gracefulShutdown sends /gsd:pause-work into pane, polls 30s for completion markers, kills tmux session, sends Telegram notification | ✓ VERIFIED | server/gsd/gracefulShutdown.js exists, exports gracefulShutdown() and _testGracefulShutdown(). Sends `/gsd:pause-work\n` via tmux send-keys, polls capturePaneText every 1s for /wip:/i, /Handoff created/i, /commit [a-f0-9]{7}/i markers, kills session, calls sendNotification(). Tests in server/__tests__/graceful-shutdown.test.js all passing. Commits: e7b4a55, d8a343d. |
| 2 | Pause button route calls gracefulShutdown instead of direct tmux kill-session | ✓ VERIFIED | server/routes/gsd.js POST /projects/:name/pause-session (lines 346-370) imports gracefulShutdown at top (line 4), calls await gracefulShutdown(tmux_session, name) at line 365, returns result. Backward compat: response shape {ok:true, pauseWorkCompleted:boolean}. Commit: d8a343d. Test: pause-route.test.js passing. |
| 3 | All Phase 48 routes in PROXY_PREFIXES before Railway shadows them | ✓ VERIFIED | server/routes/proxy.js PROXY_PREFIXES array (line 13) includes '/api/gsd'. Covers /api/gsd/projects/:name/pause-session and /api/gsd/projects/:name/tmux-cost. Test: proxy-prefixes.test.js passing. Commit: e7b4a55. |
| 4 | getTmuxRssKb() sums RSS across full descendant process tree (pane + children) | ✓ VERIFIED | server/gsd/costMeasurement.js getTmuxRssKb() (lines 61-101) walks full descendant tree: gets pane PIDs, runs ps -eo pid=,ppid=,rss=, builds parent-child map, BFS traversal summing all descendants. Handles claude as child of bash/shell. Live verified: gsddashboard session 904 MB / $0.29/day (was 3.6 MB before fix). Commit: 6f3eab7 (inline fix during checkpoint). Tests: tmux-cost.test.js all passing. |
| 5 | computeDailyCost(rssKb, rateGbMonth) formula: (rssKb/1024/1024) × rateGbMonth / 30 gives $/day | ✓ VERIFIED | server/gsd/costMeasurement.js _testComputeDailyCost() (lines 44-49) implements formula. estimateTmuxCostPerDay() uses bytes equivalent. Test cases: 4GB × $10/30 ≈ $1.33/day ✓, 1GB × $10/30 ≈ $0.333/day ✓, 0 RSS → $0 ✓. Tests: tmux-cost.test.js passing. |
| 6 | GET /api/gsd/projects/:name/tmux-cost returns {sessionName, rssKb, rssGb, dailyCostUsd, rateGbMonth} | ✓ VERIFIED | server/routes/gsd.js (lines 372-397) route calls getTmuxCostForSession(), returns {ok:true, project, ...cost}. getTmuxCostForSession() (costMeasurement.js lines 131-142) computes {sessionName, rssKb, rssGb: rssKb/1024/1024, dailyCostUsd, rateGbMonth}. Proxy-aware: forwards to GSD_DATA_URL when set. Tests passing. |
| 7 | Idle detector checks session state = waiting AND paneHashCache.lastChangedAt > threshold, both must hold | ✓ VERIFIED | server/gsd/idleDetector.js isSessionIdle() (lines 47-98) dual-signature: supports options-object path {sessionState, lastChangedAt, threshold, isAutopilot} (tests) and injectable-async path (internal). Returns true only if sessionState === 'waiting' AND (nowMs - lastChangedAt) > threshold. Lines 54-62: validates both conditions. Tests: idle-detector.test.js passing. Commit: bfdce47. |
| 8 | Autopilot sessions with active runs (status IN idle/running) use 2× idle threshold | ✓ VERIFIED | server/gsd/idleDetector.js hasActiveAutopilotRun() (lines 35-45) queries autopilot_runs WHERE project_id = ? AND status IN ('idle', 'running'). _testCheckAndCloseSession() (lines 161-209) applies isAutopilot flag: const effectiveThreshold = thresholdMs × (isAutopilot ? 2 : 1); line 189. Tests: idle-detector.test.js "idle.autopilot: autopilot session uses 2× threshold" passing. Commit: bfdce47. |
| 9 | Working session silent > 6 hours force-killed without gracefulShutdown (no pause-work) | ✓ VERIFIED | server/gsd/idleDetector.js forceKillIfOverdue() (lines 130-155) checks sessionState === 'working', elapsed > FORCE_KILL_WORKING_THRESHOLD_MS (6h = line 9), calls killFn directly (no gracefulShutdownFn). Sends Telegram: "Working session force-killed after being stuck for Xh". Tests: idle-detector.test.js "force.kill: working session > 6h → forceKill without gracefulShutdown" passing. Commit: bfdce47. |
| 10 | Idle detector starts at server boot inside !GSD_DATA_URL guard, runs 60s poll with 5min startup delay | ✓ VERIFIED | server/index.js (lines 105-108) imports startIdleDetector, calls startIdleDetector(loadProjectsLocal) in else branch of GSD_DATA_URL guard. server/gsd/idleDetector.js startIdleDetector() (lines 218-238) starts 5-min delay timeout (line 236), then recursive setTimeout(tick, POLL_INTERVAL_MS) where POLL_INTERVAL_MS = 60*1000 (line 10). Avoids killing sessions on fresh deploy. Commit: e630de2. |
| 11 | Services page shows $/day column per active tmux session, fetched from /api/gsd/projects/:name/tmux-cost | ✓ VERIFIED | client/src/pages/ServicesPage.tsx: interface TmuxCost added (line 28: dailyCostUsd), per-project cost fetch (lines 150-166) using Promise.allSettled, display (lines 254-256) shows "~$X.XX/day" in orange. Tests passing, live-verified on Railway. Commit: 0b5f973. |
| 12 | Usage page shows idle cost banner ("X sessions idle, ~$Y.YY/day wasted") when aggregate cost > $0.01, hidden otherwise | ✓ VERIFIED | client/src/pages/UsagePage.tsx: fetchIdleCosts() (lines 109-135) fetches all projects' tmux costs, sums dailyCostUsd, updates state. Banner (lines 204-210) renders when idleCostPerDay > 0.01, shows session count + total cost, hides when 0. Tests passing, live-verified on Railway. Commit: 0b5f973. |

**Score:** 12/12 must-haves verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/gsd/gracefulShutdown.js` | Graceful shutdown primitive with DI injectable test variant | ✓ VERIFIED | Exists, exports gracefulShutdown + _testGracefulShutdown, full implementation with pause-work send, polling, kill, Telegram notification. 102 lines. |
| `server/gsd/costMeasurement.js` | RSS read via ps + cost math + DB log | ✓ VERIFIED | Exists. Exports: estimateTmuxCostPerDay, _testComputeDailyCost, getTmuxRssKb, getTmuxCostForSession, logDailyTmuxCosts, _testLogDailyCost. Full descendant-tree RSS walk implemented (lines 61-101). 270+ lines. |
| `server/gsd/idleDetector.js` | Idle detector with isSessionIdle, forceKillIfOverdue, startIdleDetector | ✓ VERIFIED | Exists. Dual-signature isSessionIdle (options-object + injectable-async), forceKillIfOverdue for 6h stuck working, startIdleDetector background loop, _testCheckAndCloseSession injectable. Exports all required functions. 247 lines. |
| `server/routes/gsd.js (pause-session)` | POST route calls gracefulShutdown | ✓ VERIFIED | Lines 346-370. Imports gracefulShutdown (line 4), calls await gracefulShutdown(tmux_session, name) at line 365. Returns {ok, pauseWorkCompleted}. Proxy-aware. |
| `server/routes/gsd.js (tmux-cost)` | GET route returns cost struct | ✓ VERIFIED | Lines 372-397. Calls getTmuxCostForSession(), returns {ok, project, ...cost}. Proxy-aware. 404/422 error cases handled. |
| `server/routes/proxy.js` | PROXY_PREFIXES includes /api/gsd | ✓ VERIFIED | Line 13: '/api/gsd' present in array. Ensures Railway forwards /api/gsd/* to local machine. |
| `server/routes/app-settings.js` | Seed idle_timeout_minutes + railway_ram_rate_monthly defaults | ✓ VERIFIED | Lines 23-41: PHASE_48_DEFAULTS defined (120 min default, $10/GB-month). seedPhase48Defaults() called in GET handler (line 46). Idempotent. |
| `server/index.js` | startIdleDetector() called at startup | ✓ VERIFIED | Lines 105-108: import + call inside !GSD_DATA_URL guard after stateBroadcaster. |
| `client/src/pages/ServicesPage.tsx` | $/day column per project | ✓ VERIFIED | TmuxCost interface, per-project fetch loop, display with cost.dailyCostUsd > 0 check. |
| `client/src/pages/UsagePage.tsx` | Idle cost banner | ✓ VERIFIED | fetchIdleCosts() hook, state variables for idleCostPerDay/idleSessionCount, conditional banner render (> $0.01 threshold). |
| `client/src/pages/ConfigPage.tsx` | Idle Auto-Close section with threshold, toggle, RAM rate | ✓ VERIFIED | Lines 514-590: section with Timer icon, enabled toggle, idle threshold input (minutes), RAM rate input ($/GB-month), Save buttons. Uses api.appSettings.set() to persist via PUT /api/app-settings/:key. |
| `server/gsd/tmux.js` | paneHashCache exported | ✓ VERIFIED | End-of-file module.exports includes paneHashCache. Required by idleDetector for lastChangedAt signal. |

All artifacts exist, are substantive (not stubs), and are properly wired.

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| gracefulShutdown | tmux (kill-session) | execFileSync | ✓ WIRED | Uses _killTmuxSession() helper wrapping tmux kill-session, exception-safe. Line 22-24, called at line 77. |
| gracefulShutdown | telegram | sendNotification() | ✓ WIRED | Calls await notifyFn(projectName, ...) (default: sendNotification). Lines 80-84. |
| pause-session route | gracefulShutdown | import + await call | ✓ WIRED | server/routes/gsd.js line 4 imports, line 365 calls. Full async flow. |
| costMeasurement | tmux | execFileSync ps | ✓ WIRED | getTmuxRssKb() queries tmux list-panes + ps. Lines 64-72, full implementation. |
| costMeasurement | app_settings | deferred require + decrypt | ✓ WIRED | getRailwayRate() (lines 111-120) defers require of crypto, calls getSecret('railway_ram_rate_monthly'). |
| costMeasurement | external_service_costs | db.prepare INSERT | ✓ WIRED | logDailyTmuxCosts() + logTmuxCostEstimate() insert rows. Full implementation verified. |
| idleDetector | gracefulShutdown | import + await call | ✓ WIRED | idleDetector.js line 5 imports gracefulShutdown, line 200 calls await gracefulShutdownFn(). |
| idleDetector | costMeasurement | import + calls | ✓ WIRED | Line 6 imports getTmuxCostForSession, logDailyTmuxCosts. Lines 201-202 use them. |
| idleDetector | tmux.paneHashCache | import + access | ✓ WIRED | Line 4 imports paneHashCache, accessed throughout (lines 54, 166, etc.) for lastChangedAt check. |
| idleDetector | app_settings | getIdleThresholdMs() | ✓ WIRED | Function reads encrypted idle_timeout_minutes, returns threshold in ms (lines 16-29). |
| startIdleDetector | idleDetector | tick() → _testCheckAndCloseSession() | ✓ WIRED | Background loop (lines 218-238) iterates projects, calls _testCheckAndCloseSession for each. |
| server/index.js | idleDetector | startIdleDetector(loadProjectsLocal) | ✓ WIRED | Line 107-108. Called inside !GSD_DATA_URL guard. |
| Services page | tmux-cost route | fetch + Promise.allSettled | ✓ WIRED | ServicesPage.tsx lines 150-166 fetch /api/gsd/projects/${name}/tmux-cost for each project, handle results. |
| Usage page | tmux-cost route | fetch per project, aggregate | ✓ WIRED | UsagePage.tsx fetchIdleCosts() (lines 109-135) fetches all, sums dailyCostUsd. |
| ConfigPage | app-settings PUT | api.appSettings.set(key, value) | ✓ WIRED | Lines 280, 292, 558, 581 call saveIdleSetting which calls api.appSettings.set(). Uses PUT /api/app-settings/:key. |

All key links wired. No orphaned artifacts.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODOs, FIXMEs, placeholders, or stub implementations found in Phase 48 artifacts. |

**Result:** Clean. No blockers, no warnings.

---

## Test Coverage

### Automated Tests (All Passing)

```
server/__tests__/graceful-shutdown.test.js
  ✓ graceful.shutdown: sends /gsd:pause-work into pane then kills session
  ✓ graceful.shutdown: on pause-work timeout, kills session anyway + notifies Telegram
  ✓ graceful.fallback: sends Telegram notification with failure message on timeout
  ✓ graceful.shutdown: returns {ok:true, pauseWorkCompleted:true} on marker found
  ✓ graceful.shutdown: returns {ok:true, pauseWorkCompleted:false} on timeout

server/__tests__/idle-detector.test.js
  ✓ idle.detect: waiting + pane unchanged > threshold → isSessionIdle returns true
  ✓ idle.detect: working + pane unchanged > threshold → isSessionIdle returns false
  ✓ idle.detect: waiting + pane changed within threshold → isSessionIdle returns false
  ✓ idle.autopilot: autopilot session uses 2× threshold
  ✓ force.kill: working session > 6h → forceKill without gracefulShutdown

server/__tests__/tmux-cost.test.js
  ✓ tmux.cost: RSS 4096 MB × $10/GB-month / 30 days ≈ $1.33/day
  ✓ tmux.cost: RSS 0 returns $0.00/day
  ✓ cost.log: logTmuxCostEstimate inserts row into external_service_costs

server/__tests__/pause-route.test.js
  ✓ pause.route: POST /pause-session calls gracefulShutdown not direct tmux kill

server/__tests__/proxy-prefixes.test.js
  ✓ proxy.prefix: /api/gsd is listed in PROXY_PREFIXES
```

**Status:** All 15 Phase 48 tests passing. Full server test suite clean.

### Human Verification (Not Needed)

All testable behaviors verified programmatically. No external service dependencies or UI-only behaviors blocking goal achievement.

---

## Deviations & Fixes

### Inline Fix: getTmuxRssKb() Process Tree Walk

**Status:** Corrected during human-verify checkpoint (commit 6f3eab7)

**Issue Found:** Initial implementation measured only pane PID (bash, ~3.6 MB), missing Claude Code child process (~500-900 MB).

**Fix Applied:** getTmuxRssKb() now walks full descendant process tree:
1. Query tmux list-panes for all pane PIDs
2. Run ps -eo pid=,ppid=,rss= to get full process forest
3. Build parent-child map
4. BFS traversal from pane PIDs, summing RSS for all descendants

**Live Result Post-Fix:** gsddashboard session 904 MB / $0.29/day (was 3.6 MB / $0.001/day before fix)

**Impact:** Essential correctness fix. Without it, cost surface would show near-zero values and be useless. No scope creep beyond initial plan — fix was implementation detail, not spec change.

**Tests:** All tmux-cost.test.js tests still passing post-fix.

---

## Deployment Status

**Live Verified:** 2026-04-15

- Railway deployment up and live: https://gsd-dashboard-production.up.railway.app
- All Phase 48 routes responding
- Cost data realistic and updated
- Idle detector loop running with 5-min startup delay, 60s poll interval
- Services page showing per-session $/day column
- Usage page showing idle cost banner
- ConfigPage Idle Auto-Close section with threshold/RAM rate controls
- PM2 monitoring active

---

## Summary

**Phase Goal Achieved:** ✓

Idle session cost controls are fully implemented, tested, deployed, and live-verified.

**Deliverables:**
1. ✓ Graceful shutdown primitive (send /gsd:pause-work, poll, kill, notify)
2. ✓ Cost measurement (RSS → $/day via Railway rate)
3. ✓ Idle detector background loop (waiting + pane-unchanged > threshold)
4. ✓ Autopilot 2× threshold support
5. ✓ Force-kill for stuck working sessions (6h+)
6. ✓ Config UI with idle timeout + RAM rate settings
7. ✓ Services page $/day column
8. ✓ Usage page idle cost banner
9. ✓ Daily cost history logging to external_service_costs

**All must-haves verified. Ready for next phase.**

---

_Verified: 2026-04-15T13:45:00Z_
_Verifier: Claude (gsd-verifier)_
