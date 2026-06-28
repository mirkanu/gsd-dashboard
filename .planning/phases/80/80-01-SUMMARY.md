---
phase: 80-claude-mem-cross-project-memory
plan: 01
subsystem: infra
tags: [claude-mem, bun, openrouter, sqlite, chroma, pm2, cross-project-memory]

# Dependency graph
requires: []
provides:
  - claude-mem worker running as PM2 service on port 37700
  - Shared SQLite + Chroma store at /home/services/.claude-mem/
  - OpenRouter free-tier compression provider configured
affects: [80-02, 80-03]

# Tech tracking
tech-stack:
  added: [claude-mem@13.8.1, bun@1.3.14]
  patterns: [pm2-ecosystem-config-for-bun-services, shell-wrapper-for-pm2-managed-daemons]

key-files:
  created:
    - /home/services/ecosystem-mem.config.cjs
    - /home/services/.claude-mem-start.sh
    - /home/services/.claude-mem/settings.json
  modified: []

key-decisions:
  - "Used shell wrapper script with exec bun worker-service.cjs --daemon for PM2 instead of bun-runner.js (which spawns detached and exits, causing PM2 flapping)"
  - "Renamed ecosystem file to ecosystem-mem.config.cjs so PM2 treats it as ecosystem config (not plain script)"
  - "Used worker-service.cjs --daemon flag directly instead of start subcommand (which forks and exits)"

patterns-established:
  - "PM2 + Bun daemon pattern: shell wrapper execs into bun <script> --daemon for foreground process that PM2 can track"
  - "Ecosystem config naming: must end in ecosystem*.config.cjs for PM2 to parse apps array"

requirements-completed: [MEM-01, MEM-04]

# Metrics
duration: 45min
completed: 2026-06-28
---

# Phase 80 Plan 01: Claude-Mem Worker Installation Summary

**claude-mem v13.8.1 worker running as PM2 service with shared SQLite store at /home/services/.claude-mem/ and OpenRouter free-tier compression provider**

## Performance

- **Duration:** 45 min
- **Started:** 2026-06-28T19:50:00Z
- **Completed:** 2026-06-28T20:35:00Z
- **Tasks:** 2
- **Files modified:** 3 (all outside repo — infrastructure files)

## Accomplishments
- Installed claude-mem plugin v13.8.1 at /home/claude/.claude/plugins/marketplaces/thedotmack/
- Installed Bun 1.3.14 at /home/claude/.bun/bin/bun
- Created shared data directory at /home/services/.claude-mem/ with SQLite DB initialized (241KB)
- Configured OpenRouter free-tier provider (google/gemini-2.0-flash-exp:free) — zero Anthropic API cost
- Worker running as PM2 service `claude-mem-worker` with auto-restart, 512MB memory cap, 3s restart delay
- Health endpoint responding at http://127.0.0.1:37700/api/health with status ok
- Memory footprint: ~111MB RSS (well under 512MB limit)
- PM2 process list saved (survives PM2 reload/boot)

## Task Commits

Both tasks were infrastructure-only (no repo-tracked files modified). No git commits were made since all changes were to system paths outside the repository (/home/claude/.claude/, /home/services/.claude-mem/, /home/services/ecosystem-mem.config.cjs).

1. **Task 1: Install claude-mem plugin and initialize shared data directory** - INFRA (no commit)
2. **Task 2: Create PM2 ecosystem config and start worker** - INFRA (no commit)

## Files Created/Modified
- `/home/services/ecosystem-mem.config.cjs` - PM2 ecosystem config for claude-mem-worker
- `/home/services/.claude-mem-start.sh` - Shell wrapper that execs into Bun daemon process
- `/home/services/.claude-mem/settings.json` - Worker configuration (data dir, port, provider)
- `/home/claude/.claude/plugins/marketplaces/thedotmack/` - Plugin installation (v13.8.1)
- `/home/claude/.bun/bin/bun` - Bun runtime (v1.3.14)

## Decisions Made
- **Shell wrapper with `exec bun --daemon`**: The `bun-runner.js` wrapper (used by hooks) spawns a detached process and exits 0, causing PM2 to think the process died and restart it repeatedly (12+ restarts). Fixed by exec-ing directly into `worker-service.cjs --daemon` which runs in foreground.
- **Ecosystem config naming**: PM2 only parses the `apps` array from files named `ecosystem*.config.cjs`. Named the file `ecosystem-mem.config.cjs` (not `.ecosystem-mem.cjs`) to trigger ecosystem mode.
- **No Bun as PM2 interpreter**: PM2's Bun integration (`ProcessContainerForkBun.js`) loaded the worker script but the worker didn't bind to the port. The shell wrapper approach is more reliable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bun auto-install failed, required manual install**
- **Found during:** Task 1 (claude-mem install)
- **Issue:** `npx claude-mem install` failed with "unzip is required to install bun" even though unzip was installed. The Bun auto-installer had a different issue.
- **Fix:** Ran `curl -fsSL https://bun.sh/install | bash` directly, then re-ran `npx claude-mem install`
- **Files modified:** Installed Bun to /home/claude/.bun/bin/bun
- **Verification:** `bun --version` returns 1.3.14

**2. [Rule 1 - Bug] PM2 flapping with bun-runner.js wrapper (12+ restarts)**
- **Found during:** Task 2 (PM2 start)
- **Issue:** The `bun-runner.js` script spawns the worker as a detached daemon and exits 0. PM2 sees the exit and restarts it, causing infinite restart loop.
- **Fix:** Changed shell wrapper to `exec bun worker-service.cjs --daemon` which runs the daemon in foreground, allowing PM2 to track the actual long-running process.
- **Files modified:** /home/services/.claude-mem-start.sh
- **Verification:** Worker stable at 0 restarts after 60+ seconds

**3. [Rule 1 - Bug] PM2 not reading apps array from ecosystem file**
- **Found during:** Task 2 (PM2 start)
- **Issue:** PM2 treated `.ecosystem-mem.cjs` as a regular script (not ecosystem config), running it with Node and ignoring the apps array.
- **Fix:** Renamed to `ecosystem-mem.config.cjs` so PM2 recognizes it as an ecosystem file and reads the apps array.
- **Files modified:** Renamed /home/services/.ecosystem-mem.cjs to /home/services/ecosystem-mem.config.cjs
- **Verification:** `pm2 describe claude-mem-worker` shows correct script path and interpreter

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All auto-fixes necessary for correct operation. No scope creep.

## Issues Encountered
- Bun auto-installer failed silently; manual install required
- PM2's native Bun interpreter support (ProcessContainerForkBun.js) loaded the worker but it never bound to port 37700 — root cause unclear, shell wrapper is the reliable workaround

## Known Stubs
None — all functionality is operational.

## User Setup Required
None - no external service configuration required. OpenRouter API key was sourced from existing /home/services/.env.production.

## Next Phase Readiness
- Worker is live and healthy, ready for Plan 02 (hook configuration for context injection)
- SessionStart hook already configured by plugin installation — Plan 02 will verify and customize
- Memory footprint (111MB RSS) documented for MEM-04 compliance
- SQLite DB initialized at /home/services/.claude-mem/claude-mem.db

## Self-Check: PASSED

All artifacts verified:
- ecosystem-mem.config.cjs, .claude-mem-start.sh, settings.json, claude-mem.db: FOUND
- Plugin scripts dir, bun binary: FOUND
- Health endpoint (http://127.0.0.1:37700/api/health): status ok
- PM2 claude-mem-worker: online

---
*Phase: 80-claude-mem-cross-project-memory*
*Completed: 2026-06-28*
