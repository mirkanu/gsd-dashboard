---
phase: 23-task-textarea-and-mcp-server
plan: 02
subsystem: mcp
tags: [mcp, gsd, typescript, tools, planning-files]

# Dependency graph
requires:
  - phase: 17-task-data-layer
    provides: GSD file serving API endpoints (GET /api/gsd/projects/:name/files/:fileId)
provides:
  - GSD planning file MCP tools domain (gsd_list_projects, gsd_read_planning_file)
  - PROJECT.md accessible via fileResolver 'project' file ID
affects: [mcp, gsd, claude-desktop-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MCP tool domain pattern: domain-specific file in mcp/src/tools/domains/, registered via registerAllTools hub"
    - "api.get<string>() returns raw text for text/plain responses via tryParseJson fallback"

key-files:
  created:
    - mcp/src/tools/domains/gsd-tools.ts
  modified:
    - server/gsd/fileResolver.js
    - mcp/src/tools/index.ts

key-decisions:
  - "Use api.get<string>() for plain-text file endpoint — DashboardApiClient.tryParseJson returns raw string when JSON parse fails, so text/plain responses work correctly without raw fetch"
  - "VALID_FILE_IDS in gsd-tools.ts excludes 'plan' — plan requires dynamic resolution from STATE.md and is not appropriate for Claude Desktop read access"

patterns-established:
  - "MCP tool domains follow: import z/ToolContext/createToolRegistrar, export registerXTools(context), call register() for each tool"

requirements-completed: [MCP-01]

# Metrics
duration: 7min
completed: 2026-03-30
---

# Phase 23 Plan 02: GSD Planning File MCP Tools Summary

**Two MCP tools added (gsd_list_projects, gsd_read_planning_file) enabling Claude Desktop to discover and read GSD planning files for any tracked project**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-30T16:15:53Z
- **Completed:** 2026-03-30T16:22:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Extended `server/gsd/fileResolver.js` to serve PROJECT.md via `project` file ID (adds to STATIC_MAPPINGS and VALID_IDS)
- Created `mcp/src/tools/domains/gsd-tools.ts` with `registerGsdTools` exporting two tools
- `gsd_list_projects`: calls GET /api/gsd/config, returns project names + display_name + archived flag
- `gsd_read_planning_file`: accepts project_name + file_id (project|state|roadmap|requirements), fetches and returns file content
- Wired `registerGsdTools` into `mcp/src/tools/index.ts` tool hub
- All verification: `npm run test:server` 104 pass (3 pre-existing unrelated failures), `npm run mcp:typecheck` clean, `npm run mcp:build` produces `mcp/build/index.js`

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend fileResolver.js to serve PROJECT.md** - `c37bd3f` (feat)
2. **Task 2: Create GSD planning tools domain and register it** - `43c5a59` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `server/gsd/fileResolver.js` - Added `project: '.planning/PROJECT.md'` to STATIC_MAPPINGS, added `'project'` to VALID_IDS
- `mcp/src/tools/domains/gsd-tools.ts` - New tool domain with gsd_list_projects and gsd_read_planning_file
- `mcp/src/tools/index.ts` - Added import and call to registerGsdTools

## Decisions Made

- Used `api.get<string>()` for plain-text file content — DashboardApiClient uses `tryParseJson` which falls back to raw string, so text/plain responses work without special handling.
- Excluded `plan` from VALID_FILE_IDS in the MCP tools — `plan` requires dynamic resolution from STATE.md (finds the active PLAN.md), which is less stable for Claude Desktop reads; the static planning files (project, state, roadmap, requirements) are the right set.
- Ran `npm run mcp:install` as deviation Rule 3 (blocking) — mcp/node_modules was missing, preventing typecheck/build.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing mcp/node_modules**
- **Found during:** Task 2 (MCP typecheck verification)
- **Issue:** `mcp/node_modules` directory did not exist; `tsc: not found` error when running `npm run mcp:typecheck`
- **Fix:** Ran `npm run mcp:install` to install MCP dependencies
- **Files modified:** mcp/node_modules/ (generated), no source changes
- **Verification:** `npm run mcp:typecheck` and `npm run mcp:build` both succeeded after install
- **Committed in:** 43c5a59 (Task 2 commit — no source file change needed)

---

**Total deviations:** 1 auto-fixed (blocking: missing node_modules)
**Impact on plan:** Necessary to run verification steps. No scope creep.

## Issues Encountered

3 pre-existing test failures in `npm run test:server` (unrelated to this plan):
- `returns version and liveUrl for a project with PROJECT.md` — readProjectMeta returning null version
- `resolves 'plan' to a path ending in -PLAN.md` — STATE.md config for plan resolution
- `returns 200 text/plain with active PLAN.md content for 'plan'` — same pre-existing issue

These were present before this plan and are outside scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MCP server now exposes GSD planning file access to Claude Desktop
- Run `npm run mcp:start` and connect to Claude Desktop using config in `mcp/README.md`
- Claude Desktop can call `gsd_list_projects` then `gsd_read_planning_file` to inspect any project's state/roadmap/requirements/project overview

---
*Phase: 23-task-textarea-and-mcp-server*
*Completed: 2026-03-30*

## Self-Check: PASSED

- FOUND: server/gsd/fileResolver.js
- FOUND: mcp/src/tools/domains/gsd-tools.ts
- FOUND: mcp/src/tools/index.ts
- FOUND: .planning/phases/23-task-textarea-and-mcp-server/23-02-SUMMARY.md
- FOUND: mcp/build/index.js
- FOUND commit c37bd3f: feat(23-02): extend fileResolver to serve PROJECT.md via 'project' file ID
- FOUND commit 43c5a59: feat(23-02): add GSD planning file MCP tools domain
