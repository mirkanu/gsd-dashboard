# Quick Task 36: Add GSD MCP tools and disable dashboard_ tools

## What Changed

### New MCP tools
- **`gsd_get_all_project_status`** — Returns live status of all projects in one call (session state, tmux status text, version, live URL, archived flag)
- **`gsd_list_tasks`** — Lists tasks for a project with optional archived filter

### Disabled tools
All `dashboard_*` tools commented out in `mcp/src/tools/index.ts`:
- observability (health, stats, analytics, system info, export, snapshot)
- sessions (list, get, create, update)
- agents (list, get, create, update)
- events & hooks
- pricing & cost
- maintenance (cleanup, reimport, clear-all-data)

These can be re-enabled by uncommenting the imports and registration calls.

### Active MCP tools (4 total)
1. `gsd_list_projects` — list tracked projects
2. `gsd_get_all_project_status` — live status overview
3. `gsd_read_planning_file` — read STATE/ROADMAP/REQUIREMENTS/PROJECT.md
4. `gsd_list_tasks` — per-project task list

## Commit
- `023ed67`: feat(quick-36): add GSD MCP tools, disable dashboard_ tools
