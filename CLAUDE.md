# Claude Code Working Guide

## Project mission
- Maintain a reliable local-first dashboard for Claude Code session monitoring.
- Preserve real-time behavior (hooks -> API -> SQLite -> WebSocket -> UI).
- Keep MCP integration production-ready for local use (`mcp/`).

## Repo map
- `server/`: Express API, hook ingestion, SQLite access, websocket broadcast.
- `client/`: React + Vite UI.
- `scripts/`: hook installer/handler, import, seed, cleanup utilities.
- `mcp/`: local MCP server exposing dashboard operations as tools.

## Non-negotiable engineering rules
- Preserve existing behavior unless explicitly asked to change it.
- Prefer minimal, reversible diffs.
- Never silently weaken safety controls around destructive actions.
- Keep docs updated when behavior, commands, file locations, or workflows change.

## Commands you should know
- Setup: `npm run setup`
- Dev: `npm run dev`
- Prod build/start: `npm run build` then `npm start`
- Server tests: `npm run test:server`
- Client tests: `npm run test:client`
- MCP install/build/start: `npm run mcp:install`, `npm run mcp:build`, `npm run mcp:start`
- MCP typecheck: `npm run mcp:typecheck`

## Testing and verification policy
- Backend changes: run `npm run test:server` before finishing.
- Frontend changes: run `npm run test:client` when relevant.
- MCP changes: run `npm run mcp:typecheck` and `npm run mcp:build`.
- If you cannot run a verification step, state exactly what was not run and why.

## Change guidelines by area
- API routes: preserve response shapes unless change is requested and documented.
- Database: avoid schema changes without migration-safe logic.
- Hooks: keep fail-safe and non-blocking behavior.
- WebSocket: keep message types stable and backward-compatible.
- Documentation: include exact commands and paths; keep markdown examples runnable.

## Agent behavior
- Explore first, then implement.
- For larger tasks, propose/check a short plan before broad edits.
- Use file-specific rules in `.claude/rules/` when working in scoped areas.
- Use project skills from `.claude/skills/` for repeatable workflows.
- Use `.claude/agents/` subagents for focused review or investigation passes.
- After every plan execution completes, run `/gsd-verify-work` before reporting done — do not wait for a dashboard trigger.

## GSD Command Suggestions

When the user describes what they want in plain English, suggest the most relevant `/gsd-*` command from this table rather than asking them to look it up.

| User says (examples) | Suggest |
|---|---|
| "what's next?", "keep going", "what should I do?", "advance the project", "continue" | `/gsd-next` |
| "pick up where I left off", "resume", "I'm back", "restore context" | `/gsd-resume-work` |
| "how is it going?", "project status", "what have we done?", "show progress" | `/gsd-progress` |
| "stop for now", "save my place", "I need a break", "pause" | `/gsd-pause-work` |
| "plan the next phase", "create a plan", "I want to plan phase N" | `/gsd-plan-phase N` |
| "start building", "execute the plan", "run the phase", "build it" | `/gsd-execute-phase N` |
| "small fix", "quick task", "do this one thing", "minor change" | `/gsd-quick` |
| "check if it works", "run the tests", "verify what we built", "did it work?" | `/gsd-verify-work` |
| "I want to start a new project", "new project", "initialize" | `/gsd-new-project` |
| "I have an idea for a phase", "I want to describe my vision", "discuss the plan" | `/gsd-discuss-phase N` |
| "debug this", "something is broken", "fix this error" | `/gsd-debug` |
| "what commands are available?", "help", "what can GSD do?" | `/gsd-help` |

If the user's intent is ambiguous between two commands, name both and let the user pick. Never silently pick one without saying so.
