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
- **Playwright UAT order**: deploy first (`npm run build` is a stub — use `cd client && npx vite build`, then `pm2 restart gsd-dashboard`), then run Playwright against **https://dashboard.gsdlabs.dev** (the live Cloudflare tunnel), not localhost. Testing localhost before deploying does not verify the user's actual experience.

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

---

## Verbosity Contract

These rules apply to every terminal session in this project. They reduce what Claude says in the terminal so the tmux pane stays readable.

1. **Skip CONTEXT.md interrogation when CONTEXT.md already exists.** If `.planning/phases/{phase}/{phase}-CONTEXT.md` is present, do not re-interview the user about the phase — proceed directly to planning.
2. **Name the phase in plain English in the first line of the session report.** Instead of "I will now begin Phase 56", write "Starting CLI Verbosity Contract + Portfolio Feed work." One line, present tense, specific.
3. **Don't repeat what the user just said.** If the user said "plan phase 56", do not echo back "You asked me to plan phase 56." Begin the work.
4. **Prefer one-line status updates.** Instead of a paragraph explaining what you are about to do, emit a single line: "Reading roadmap." "Writing plan 01." "Done." Reserve multi-line output for actual results (lists of tasks, file paths, errors).
5. **Active voice, present tense.** Write "Creating feedStore.js" not "feedStore.js will be created" and not "I am in the process of creating feedStore.js".

<!-- GSD:non-programmer-contract-start source:templates/claude-md.md -->
## Non-Programmer Contract

Claude must never ask the user to perform a programmer action that Claude can do itself. Technical decisions are made by Claude using its own judgment, documented in the session report, and reversible by the user in plain English.

| Forbidden | Replacement |
|-----------|-------------|
| Asking user to open/view/read code | Read it yourself; summarise findings in plain English |
| Asking user to paste git diffs or logs | Read them yourself with `git diff`, `git log`, or file reads |
| Asking user to edit a config/.env/any file | Edit it yourself; use the Global Env Editor (Dashboard) if credentials are missing |
| Asking user to run a terminal command | Run it yourself |
| "Deploy started, check back in a few minutes" | Run the deploy, wait for it, verify it's live, then ping the user |
| Asking user to run the tests | Run them yourself; only report after they pass (or after a real failure needing a decision) |
| Asking user a technical architecture decision in jargon | Decide yourself; state the decision in plain English; offer to change course |
| Asking user to review code before commit | Commit yourself after verify-work passes |
| "You'll need to do X manually after this finishes" | Don't finish until X is done, or add X to the plan |
| "I'll leave this for you to configure" | Configure with a sensible default; document in the session report |
| Technical disambiguation questions mid-plan | Use CLAUDE.md defaults; only escalate if truly stuck, framed in plain English |
| Asking user to paste an API key in the terminal | Use the Global Env Editor panel (Dashboard) |
<!-- GSD:non-programmer-contract-end -->
