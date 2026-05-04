---
phase: 70
name: hetzner-non-root-user
status: planned
created: 2026-05-04
---

# Phase 70 Context: Hetzner Non-Root User

## Problem

Claude Code's `--dangerously-skip-permissions` flag is explicitly rejected when running as root:

```
--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons
```

All Claude Code sessions on this Hetzner VPS currently run as `root`. This means:
- `--dangerously-skip-permissions` cannot be passed → Claude prompts for every tool use
- The `reopen-tmux` route works around this via `isRoot` branch (omits the flag) + settings.json allowlist
- Any tool not on the allowlist still prompts — MCP tools, edge-case variants, newly added tools
- The workaround in Phase 63 (global `Skill(gsd-*)` in settings.json) mitigates but doesn't fully solve this

## Solution

Create a non-root `claude` OS user on the Hetzner VPS. SSH in as `claude@hetzner` for all future
Claude Code sessions. The flag works as normal, no permission prompts. Also improves security hygiene.

## Migration Scope

1. **Check + create docker group** if it doesn't exist
2. **Create `claude` user** with home directory at `/home/claude`
3. **Add `claude` to docker group** so it can run docker commands (needed for all service management)
4. **Copy SSH authorized_keys** from root so the existing SSH key pair still works
5. **Transfer /data/home ownership** to `claude` user — all projects live here
6. **Migrate PM2** — stop PM2 as root, install PM2 for `claude` user, re-register all processes,
   set up PM2 startup as `claude`
7. **Migrate crontabs** from root to `claude` user
8. **Copy global Claude settings** from `/root/.claude/` to `/home/claude/.claude/` so GSD skills,
   permissions, and memory all carry over
9. **Fix `server/routes/gsd.js`** — remove `isRoot` branch, always pass `--dangerously-skip-permissions`
10. **Verify** SSH login as `claude` + `claude --dangerously-skip-permissions` works

## Key Files

- `server/routes/gsd.js` — isRoot branch to remove (line ~360)
- `/root/.claude/settings.json` → copy to `/home/claude/.claude/settings.json`
- `/root/.claude/projects/` → copy to `/home/claude/.claude/projects/`
- PM2 ecosystem file: `/home/services/gsddashboard/ecosystem.config.js` (or equivalent)

## Decisions

- User name: `claude` (clear intent, single purpose)
- Home: `/home/claude` (standard Linux home, not under /data which is project data)
- /data/home ownership: transfer entirely to `claude` — root no longer needs it
- /home/services ownership: transfer to `claude` — PM2, GSD Dashboard, all services live here
- Secrets (.env files): ownership transfer is safe; contents don't change
- Root access: retained for emergency use only (Hetzner rescue console)

## Out of Scope

- Disabling root SSH (keep as emergency recovery path)
- Changing any service configuration or ports
- Modifying Docker container internals
- Any application-level changes beyond the isRoot fix in gsd.js
