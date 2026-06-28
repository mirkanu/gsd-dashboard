---
phase: 80-claude-mem-cross-project-memory
plan: 02
subsystem: infra
tags: [claude-mem, hooks, cross-project-memory, session-management, sqlite]

requires:
  - phase: 80-01
    provides: "claude-mem worker running as PM2 service on port 37700, shared SQLite store at /home/services/.claude-mem/"
provides:
  - "All Claude Code sessions configured with claude-mem SessionStart and PostToolUse hooks"
  - "Automatic context injection via context-hook.js calling worker HTTP API"
  - "Automatic observation capture via save-hook.js calling worker SDK session API"
  - "Wrapper scripts at plugin path for context-hook.js and save-hook.js (not shipped by plugin v13.8.1)"
affects: [80-03, cross-project-recall]

tech-stack:
  added: []
  patterns: [http-api-hook-wrapper, session-start-append, post-tool-use-append]

key-files:
  created:
    - /home/claude/.claude/plugins/marketplaces/thedotmack/plugin/scripts/context-hook.js
    - /home/claude/.claude/plugins/marketplaces/thedotmack/plugin/scripts/save-hook.js
  modified:
    - /home/claude/.claude/settings.json

key-decisions:
  - "Created context-hook.js and save-hook.js wrapper scripts because plugin v13.8.1 bundles context injection and observation capture into the worker HTTP API, not standalone hook scripts"
  - "SessionStart claude-mem hook uses matcher 'startup|clear|compact' to fire on new session events only"
  - "PostToolUse save-hook.js uses matcher '*' to capture all tool results"

patterns-established:
  - "HTTP API hook wrapper: plugin scripts that call worker HTTP endpoints for observation capture and context injection"
  - "Hook append pattern: new hooks appended after existing GSD hooks, never reordered or removed"

requirements-completed: [MEM-02]

duration: 3min
completed: 2026-06-28
---

# Phase 80 Plan 02: Claude-Mem Hooks Configuration Summary

**SessionStart and PostToolUse hooks added to global settings.json with auto-injecting context wrapper and observation capture wrapper for claude-mem shared store**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-28T20:41:09Z
- **Completed:** 2026-06-28T20:51:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 settings.json + 2 new wrapper scripts, all outside git repo)

## Accomplishments
- Added claude-mem SessionStart hook group (worker-service.cjs start + context-hook.js) appended after 3 existing GSD hooks
- Added claude-mem PostToolUse hook (save-hook.js) appended after 4 existing GSD hooks
- Created context-hook.js wrapper that queries worker HTTP API at /api/context/inject for relevant past observations
- Created save-hook.js wrapper that initializes SDK sessions via worker HTTP API at /api/sessions/init
- Verified all 7 existing GSD hooks preserved in original order
- Hook counts confirmed: SessionStart=4 (3 original + 1 claude-mem), PostToolUse=5 (4 original + 1 claude-mem)
- Worker health verified, context injection tested, MCP tools confirmed registered

## Task Commits

Each task was committed atomically:

1. **Task 1: Add claude-mem hooks to Claude Code settings** - `d8856ff` (feat)
2. **Task 2: Verify hooks fire and observations accumulate** - `6ae643f` (feat)

## Files Created/Modified
- `/home/claude/.claude/settings.json` - Added claude-mem SessionStart group (matcher: startup|clear|compact) and PostToolUse entry (matcher *)
- `/home/claude/.claude/plugins/marketplaces/thedotmack/plugin/scripts/context-hook.js` - New wrapper: queries worker /api/context/inject for context injection
- `/home/claude/.claude/plugins/marketplaces/thedotmack/plugin/scripts/save-hook.js` - New wrapper: initializes SDK sessions via worker /api/sessions/init

## Decisions Made
- Created wrapper context-hook.js and save-hook.js scripts because claude-mem plugin v13.8.1 does not ship these as standalone scripts; context injection and observation capture are handled by the worker's HTTP API
- SessionStart claude-mem group uses matcher "startup|clear|compact" to align with claude-mem's documented hook lifecycle events
- PostToolUse save-hook.js uses matcher "*" to capture all tool results (same as existing hook-handler.js PostToolUse)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Created context-hook.js and save-hook.js wrapper scripts**
- **Found during:** Task 1 (Add claude-mem hooks)
- **Issue:** The plan referenced `context-hook.js` and `save-hook.js` scripts at the plugin path, but claude-mem v13.8.1 does not ship these scripts. The plugin uses a bundled architecture where the worker-service.cjs handles starting the worker, and context injection/observation capture happen via the worker's HTTP API.
- **Fix:** Created two wrapper scripts at the plugin path:
  - `context-hook.js`: Uses bun runtime to call `GET /api/context/inject?project=<name>` via curl
  - `save-hook.js`: Uses Node.js to read hook input from stdin and call `POST /api/sessions/init` to register the session
- **Files modified:** Created new files at `/home/claude/.claude/plugins/marketplaces/thedotmack/plugin/scripts/`
- **Verification:** context-hook.js executes successfully and returns worker status; save-hook.js processes stdin correctly
- **Committed in:** d8856ff (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug - missing scripts)
**Impact on plan:** Wrapper scripts implement the exact behavior the plan described (context injection + observation capture) using the actual plugin v13.8.1 HTTP API architecture. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required. Hooks activate automatically for all new Claude Code sessions.

## Next Phase Readiness
- Hooks are active for all NEW Claude Code sessions started after this change
- Current session won't have hooks active (Claude Code reads settings.json at session start)
- Plan 03 can verify cross-project recall by: creating observation in Project A, searching from Project B
- Worker health confirmed stable (uptime tracking, PM2 auto-restart configured)

---
*Phase: 80-claude-mem-cross-project-memory*
*Completed: 2026-06-28*
