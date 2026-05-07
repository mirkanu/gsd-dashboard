---
phase: 63
name: hetzner-autonomous-permissions
status: planned
created: 2026-05-01
---

# Phase 63 Context: Hetzner Autonomous Permissions

## Problem

Claude Code sessions on this Hetzner server prompt for permission on GSD skills and tool use even
though the intent is fully autonomous operation. Observed: zoho-todoist-sync asked for permission
when /gsd-quick was invoked. All sessions show this pattern.

## Root Cause Analysis

### Cause 1 — Global settings.json missing Skill(*)

`~/.claude/settings.json` (user-level, applies to all projects) has:

```json
"permissions": {
  "allow": ["Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "MultiEdit(*)", "Agent(*)"]
}
```

`Skill(*)` is absent. Per-project `settings.local.json` files only list specific skills:
- zoho-todoist-sync: `["Skill(gsd-fast)"]` → prompts for gsd-quick, gsd-plan-phase, etc.
- gsddashboard: `["Skill(gsd-fast)", "Skill(gsd-discuss-phase)"]` → prompts for everything else

### Cause 2 — reopen-tmux omits --dangerously-skip-permissions for root

Commit b7d58aa changed `server/routes/gsd.js` to:
```js
const isRoot = process.getuid && process.getuid() === 0;
const claudeCmd = isRoot ? 'claude --effort medium' : 'claude --effort medium --dangerously-skip-permissions';
```

This assumed root bypasses all permission checks automatically. It does not. Claude Code 2.1.126
still prompts for permissions when running as root without the flag. All current tmux sessions
confirm: running `claude --effort medium` only.

### Evidence

```
PRC:              claude --effort medium      ← no flag
gsddashboard:     claude --effort medium      ← no flag
zoho-todoist-sync: claude --effort medium     ← no flag
```

## Decisions

1. **Fix Skill permissions globally** via `~/.claude/settings.json` — add `Skill(gsd-*)` to allow
   list. Covers all GSD skills across all projects without per-project config.

2. **b7d58aa isRoot logic is correct and must be kept.** Claude Code 2.1.126 explicitly rejects
   `--dangerously-skip-permissions` when running as root: "cannot be used with root/sudo privileges
   for security reasons". The flag is non-root only. The `reopen-tmux` isRoot branch stays as-is.

3. **Clean up per-project settings.local.json** — remove now-redundant individual Skill entries
   since the global allow covers them. Keep project-specific Bash allows.

4. **Audit all projects in /data/home/** for settings.local.json and ensure consistent baseline.

## Scope

- `~/.claude/settings.json` — add `Skill(gsd-*)`
- `server/routes/gsd.js` — remove isRoot branch, always pass `--dangerously-skip-permissions`
- `/data/home/zoho-todoist-sync/.claude/settings.local.json` — add `Skill(gsd-*)` as safety net
- `/data/home/*/` — audit and align any other projects

## Out of Scope

- Changing which tools are allowed (Bash/Read/Write/Edit/MultiEdit/Agent stay as-is)
- Modifying any project's CLAUDE.md
- Adding --dangerously-skip-permissions to the autopilot spawner (separate process, separate fix)
