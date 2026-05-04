---
phase: 70-hetzner-non-root-user
plan: "01"
subsystem: infrastructure/os
tags: [hetzner, non-root, user-migration, ssh, docker, cloudflare, claude-config]
dependency_graph:
  requires: []
  provides: [claude-os-user, ssh-access-claude, directory-ownership-claude, cloudflare-credentials-claude, claude-code-config-claude]
  affects: [70-02-pm2-migration, 70-03-code-fixes]
tech_stack:
  added: []
  patterns: [useradd, usermod, chown-hR-symlink-safe, install-m600, cp-a-preserve]
key_files:
  created:
    - /home/claude/.ssh/authorized_keys
    - /home/claude/.cloudflare-tunnel/ (moved from /root/)
    - /home/claude/.claude/ (copied from /root/.claude/)
  modified:
    - /home/claude/.claude/settings.json (path rewrite: /root/ -> /home/claude/)
decisions:
  - "Move /root/.cloudflare-tunnel/ to /home/claude/.cloudflare-tunnel/ (mv not cp) per locked decision"
  - "Use chown -hR on /data/home/ to change symlinks themselves, not their targets"
  - "Use cp -a /root/.claude/ to preserve all timestamps, symlinks, and structure"
  - "claude user gets UID 1000 — first user on this VPS, standard Linux assignment"
metrics:
  duration_minutes: 27
  completed_date: "2026-05-04T21:02:40Z"
  tasks_completed: 3
  tasks_total: 4
  files_created: 3
  files_modified: 1
---

# Phase 70 Plan 01: Create claude OS User and Migrate Ownership Summary

**One-liner:** Created `claude` OS user (UID 1000, docker group), migrated all service directory ownership to claude:claude, moved Cloudflare tunnel credentials, and copied Claude Code global config with /root/ path reference corrected.

## Tasks Completed

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Create claude user, add to docker group, copy SSH keys | DONE | OS-level only — no repo files changed |
| 2 | Transfer directory ownership and migrate Cloudflare tunnel credentials | DONE | OS-level only — no repo files changed |
| 3 | Copy Claude Code global config and fix /root/ path reference | DONE | OS-level only — settings.json rewritten at new path |
| 4 | Checkpoint: human SSH verification | PENDING | Awaiting human verification |

## What Was Built

### Task 1: claude OS User
- Created `claude` user with `useradd -m -s /bin/bash -d /home/claude claude`
- UID 1000, GID 1000 (first non-system user on this VPS)
- Added to docker group (GID 988) via `usermod -aG docker claude`
- Copied all 3 SSH authorized_keys from `/root/.ssh/authorized_keys` to `/home/claude/.ssh/authorized_keys`
- `/home/claude/.ssh/` mode 700, `authorized_keys` mode 600, both owned by claude:claude

### Task 2: Directory Ownership Transfer
- `/data/home/` — transferred with `chown -hR` (symlink-safe) — symlinks now owned by claude but still point to `/home/services/*`
- `/home/services/` — transferred with `chown -R` — all subdirectories now owned by claude:claude
  - gsddashboard, debates, KidAI, ynab, backups, hetzner-vps, reforma all verified
- `/root/.cloudflare-tunnel/` — MOVED (not copied) to `/home/claude/.cloudflare-tunnel/`
  - Both `config.yml` and `credentials.json` transferred and chowned to claude:claude
  - `/root/.cloudflare-tunnel` no longer exists (verified)

### Task 3: Claude Code Config Migration
- `cp -a /root/.claude/ /home/claude/.claude/` — all 19 top-level entries copied with preserved timestamps and symlinks
- `chown -R claude:claude /home/claude/.claude/` — full ownership transfer
- `sed -i` rewrote the single `/root/` reference in settings.json:
  - Before: `/root/.claude/hooks/gsd-read-injection-scanner.js`
  - After: `/home/claude/.claude/hooks/gsd-read-injection-scanner.js`
- Verified: `grep -c "root" /home/claude/.claude/settings.json` returns 0

## Verification Results

```
PASS: docker group (id claude | grep docker)
PASS: 600 perms (/home/claude/.ssh/authorized_keys)
PASS: owned by claude (authorized_keys)
PASS: 3 lines match (same keys as /root/.ssh/authorized_keys)
PASS: gsddashboard owned by claude
PASS: /data/home owned by claude
PASS: credentials.json exists at /home/claude/.cloudflare-tunnel/
PASS: moved away from root (no /root/.cloudflare-tunnel)
PASS: debates owned by claude
PASS: ynab owned by claude
PASS: KidAI owned by claude
PASS: no /root/ in settings.json
PASS: settings.json exists
PASS: hook gsd-read-injection-scanner.js exists at new path
PASS: /home/claude/.claude owned by claude
```

## Checkpoint Reached (Task 4)

**Type:** human-verify (blocking)

The user must SSH in as `claude` from their local machine to verify:
1. SSH login as `claude@<HETZNER_VPS_IP>` succeeds with existing key
2. `whoami` → claude
3. `docker ps` → lists containers (no permission error)
4. `id` → uid=1000(claude) gid=1000(claude) groups=...,988(docker)
5. `ls /data/home/` → directories owned by claude
6. `ls /home/services/` → directories owned by claude
7. `ls ~/.cloudflare-tunnel/credentials.json` → exists
8. `grep "root" ~/.claude/settings.json` → NO output

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — all actions follow the threat model:
- T-70-01-01: claude NOT added to sudo group (verified: `id claude` shows no sudo)
- T-70-01-02: Same authorized_keys as root copied (no new keys introduced)
- T-70-01-03: Ownership transfer via chown -R is intentional per plan

## Self-Check: PASSED

All OS-level artifacts verified:
- FOUND: claude user UID 1000
- FOUND: /home/claude/.ssh/authorized_keys
- FOUND: /home/claude/.cloudflare-tunnel/credentials.json
- FOUND: /root/.cloudflare-tunnel does not exist (moved correctly)
- FOUND: /home/claude/.claude/settings.json
- FOUND: hook file at new path (/home/claude/.claude/hooks/gsd-read-injection-scanner.js)
- FOUND: zero /root/ references in settings.json
- FOUND: claude in docker group
- FOUND: SUMMARY.md created
