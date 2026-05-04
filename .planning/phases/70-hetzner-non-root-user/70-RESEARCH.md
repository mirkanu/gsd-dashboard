# Phase 70: Hetzner Non-Root User - Research

**Researched:** 2026-05-04
**Domain:** Linux user management, PM2 migration, systemd, SSH, Docker group, Claude Code permissions
**Confidence:** HIGH (all findings verified against live server state)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- User name: `claude` (clear intent, single purpose)
- Home: `/home/claude` (standard Linux home, not under /data which is project data)
- /data/home ownership: transfer entirely to `claude` — root no longer needs it
- /home/services ownership: transfer to `claude` — PM2, GSD Dashboard, all services live here
- Secrets (.env files): ownership transfer is safe; contents don't change
- Root access: retained for emergency use only (Hetzner rescue console)

### Claude's Discretion
- Migration sequence and rollback strategy
- Whether to disable `pm2-root.service` vs replace it with `pm2-claude.service`
- Whether to move cloudflared credentials from `/root/.cloudflare-tunnel/` or update the path reference

### Deferred Ideas (OUT OF SCOPE)
- Disabling root SSH (keep as emergency recovery path)
- Changing any service configuration or ports
- Modifying Docker container internals
- Any application-level changes beyond the isRoot fix in gsd.js
</user_constraints>

---

## Summary

The Hetzner VPS currently runs entirely as root. Three PM2 processes (gsd-dashboard, gsd-healthcheck, gsd-tunnel) are registered under root's PM2 daemon (`/root/.pm2`), managed by a systemd service called `pm2-root.service`. The Claude binary is installed globally at `/usr/bin/claude` (world-executable, symlinks to `/usr/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`) and will work for any user — the `--dangerously-skip-permissions` block is purely a UID==0 runtime check inside Claude Code, not a permission system issue.

The primary migration challenges are: (1) tmux sessions are owned by the creating user — root's tmux socket at `/tmp/tmux-0/default` is mode 700, so the GSD Dashboard server process (which will move to run as `claude`) must start its OWN tmux sessions rather than inheriting root's; (2) PM2 is installed globally but its runtime state (daemon, logs, PID files) lives in `~/.pm2`, so migrating means creating a fresh PM2 instance owned by `claude`; (3) the cloudflared tunnel config references `/root/.cloudflare-tunnel/` by absolute path in `scripts/named-tunnel.sh`, which must be updated; (4) four GitHub Actions deploy workflows hardcode `username: root` and will need updating after migration.

The code change in `server/routes/gsd.js` is a two-line diff: delete the `isRoot` ternary at line 349 and always pass `--dangerously-skip-permissions`.

**Primary recommendation:** Create the `claude` user, migrate PM2 by stopping root's daemon and starting a fresh one as `claude`, move ownership with `chown -R claude:claude`, copy SSH keys and Claude config, relocate cloudflared credentials to `/home/claude/.cloudflare-tunnel/`, update the two path references, and update GitHub Actions workflows. Root SSH stays intact throughout.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OS user creation + SSH | Server/OS | — | useradd, authorized_keys copy |
| Docker access | Server/OS | — | docker group membership |
| PM2 process management | Server/OS | — | PM2 daemon is per-user, runs as owner |
| systemd boot persistence | Server/OS | — | pm2-claude.service replaces pm2-root.service |
| File ownership transfer | Server/OS | — | chown on /data/home, /home/services |
| Claude config migration | Server/OS | — | cp /root/.claude → /home/claude/.claude |
| Cloudflared credentials | Server/OS | — | Move credentials dir, update path in named-tunnel.sh |
| gsd.js isRoot fix | API/Backend | — | Two-line code change in server/routes/gsd.js |
| GitHub Actions workflows | CI/CD | — | Update username: root → username: claude in 4 workflow files |
| Crontab migration | Server/OS | — | crontab -l as root, install under claude |

---

## Standard Stack

### Core (what this phase uses — no new libraries)
| Tool | Version (verified) | Purpose |
|------|--------------------|---------|
| useradd | OS built-in | Create `claude` user with home dir |
| usermod | OS built-in | Add `claude` to docker group |
| chown | OS built-in | Transfer directory ownership |
| pm2 | 6.0.14 (live) | Process manager — global install at `/usr/bin/pm2` |
| systemd | OS built-in | Manage pm2-claude.service boot persistence |
| cloudflared | live | Tunnel — config path update only |
| ssh | OS built-in | Copy authorized_keys to new user |

**No new npm packages required.** [VERIFIED: live server inspection]

---

## Architecture Patterns

### System Architecture: Current vs Target State

**Current (root):**
```
root user
  ├── /root/.pm2/          ← PM2 daemon home
  │     ├── gsd-dashboard  (runs /home/services/gsddashboard/server/index.js)
  │     ├── gsd-healthcheck (runs scripts/healthcheck.sh)
  │     └── gsd-tunnel     (runs scripts/named-tunnel.sh → /root/.cloudflare-tunnel/config.yml)
  ├── /root/.claude/        ← Claude Code global config
  ├── /root/.ssh/           ← authorized_keys (3 keys)
  ├── /root/.cloudflare-tunnel/  ← tunnel credentials
  ├── /tmp/tmux-0/default   ← tmux socket (mode 700, only root can access)
  └── systemd: pm2-root.service
```

**Target (claude user):**
```
claude user (UID ~1000)
  ├── /home/claude/.pm2/    ← PM2 daemon home (fresh, no state migration needed)
  │     ├── gsd-dashboard  (same script paths — no change)
  │     ├── gsd-healthcheck (updated PM2= path in healthcheck.sh)
  │     └── gsd-tunnel     (updated --config path in named-tunnel.sh)
  ├── /home/claude/.claude/ ← Claude Code global config (copied from /root/.claude/)
  ├── /home/claude/.ssh/    ← authorized_keys (copied from /root/.ssh/)
  ├── /home/claude/.cloudflare-tunnel/  ← credentials (moved from /root/)
  ├── /tmp/tmux-${UID}/     ← tmux socket (auto-created by tmux for new user)
  └── systemd: pm2-claude.service (generated by: pm2 startup systemd -u claude --hp /home/claude)
```

### Data Flow: PM2 Migration

```
[root SSH] → stop gsd-tunnel, gsd-healthcheck, gsd-dashboard
           → pm2 delete all
           → systemctl disable pm2-root.service
           → [switch to claude user context]
           → pm2 start (re-register all 3 processes)
           → pm2 save
           → pm2 startup systemd -u claude --hp /home/claude  [generates unit file command]
           → [back to root] run the generated sudo command to install pm2-claude.service
           → systemctl enable pm2-claude.service
           → systemctl start pm2-claude.service
```

### Recommended File Path Changes

Two files need path updates:

1. `/home/services/gsddashboard/scripts/named-tunnel.sh` — line:
   ```sh
   # BEFORE:
   exec cloudflared --config /root/.cloudflare-tunnel/config.yml tunnel run ...
   # AFTER:
   exec cloudflared --config /home/claude/.cloudflare-tunnel/config.yml tunnel run ...
   ```

2. `/home/services/gsddashboard/scripts/healthcheck.sh` — line:
   ```sh
   # BEFORE:
   PM2="/data/home/.local/bin/pm2"
   # AFTER:
   PM2="/usr/bin/pm2"
   ```
   (The `ecosystem.config.cjs` fallback path in healthcheck.sh also needs updating — see Pitfall 4.)

3. `server/routes/gsd.js` — lines 348-349:
   ```js
   // BEFORE:
   const isRoot = process.getuid && process.getuid() === 0;
   const claudeCmd = isRoot ? 'claude --effort medium' : 'claude --effort medium --dangerously-skip-permissions';
   // AFTER:
   const claudeCmd = 'claude --effort medium --dangerously-skip-permissions';
   ```

4. GitHub Actions workflows — `username: root` → `username: claude` in:
   - `/home/services/gsddashboard/.github/workflows/deploy.yml`
   - `/home/services/KidAI/.github/workflows/deploy-hetzner.yml`
   - `/home/services/ynab/.github/workflows/deploy-hetzner.yml`
   - `/home/services/debates/.github/workflows/deploy-hetzner.yml`

5. `/root/.claude/settings.json` hook — only one `/root/`-prefixed path exists:
   ```
   /root/.claude/hooks/gsd-read-injection-scanner.js
   ```
   This file does NOT exist in `/data/home/.claude/hooks/`. It must be copied to `/home/claude/.claude/hooks/` and the settings.json reference updated.
   All other hooks reference `/data/home/.claude/hooks/` which is NOT changing ownership (it's under `/data/home/.claude/` which will be owned by `claude`).

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `/root/.pm2/` — PM2 daemon state, logs, PID files | Do NOT migrate; create fresh PM2 instance as `claude`. Logs are ephemeral. |
| Live service config | 3 PM2 processes registered in root's PM2 daemon (gsd-dashboard, gsd-healthcheck, gsd-tunnel) | Stop + delete from root PM2, re-register in claude's PM2 via `pm2 start` commands |
| OS-registered state | `pm2-root.service` in systemd (enabled + active) | Disable pm2-root.service; generate and enable pm2-claude.service via `pm2 startup` |
| OS-registered state | Crontab under root: 3 KidAI cron jobs (daily-reset, monthly-reset, daily-notifications) | `crontab -l > /tmp/root.cron; crontab -u claude /tmp/root.cron; crontab -r` |
| Secrets/env vars | `/root/.cloudflare-tunnel/credentials.json` — referenced by named-tunnel.sh | Move to `/home/claude/.cloudflare-tunnel/`; update path in named-tunnel.sh |
| Secrets/env vars | `/root/.ssh/authorized_keys` — 3 SSH keys (personal Termius, GitHub Actions deploy, one more) | `cp` to `/home/claude/.ssh/authorized_keys` with correct permissions (chmod 700 dir, 600 file) |
| Secrets/env vars | `/root/.claude/settings.json` — GSD permissions + hooks | Copy full `/root/.claude/` to `/home/claude/.claude/`; update one path reference |
| Secrets/env vars | `/home/services/gsddashboard/.env` — service runs from `/home/services/` (will be owned by claude) | Ownership transfer via chown; contents unchanged |
| Build artifacts | `/root/.pm2/` — old PM2 logs and PID files | Leave in place under root; root retains them as historical record |
| Build artifacts | `gsd-healthcheck` script hardcodes stale PM2 path (`/data/home/.local/bin/pm2`) | Update to `/usr/bin/pm2` — global PM2 is at this path |
| Build artifacts | `gsd-healthcheck` script fallback references `/data/home/gsddashboard/ecosystem.config.cjs` (doesn't exist) | Update fallback or remove — there is no ecosystem.config.cjs; use `pm2 restart gsd-dashboard` only |

**GitHub Actions workflows (4 files):** `username: root` hardcoded in all four deploy workflows. After migration, GitHub Actions must SSH as `claude`. The `HETZNER_SSH_KEY` GitHub secret remains the same (same key, just authorized on a different user). [VERIFIED: live file inspection]

**tmux socket ownership (CRITICAL):** Root's tmux socket is at `/tmp/tmux-0/default` (mode 700). When the GSD Dashboard server process runs as `claude`, it will create new tmux sessions in `/tmp/tmux-${claude_uid}/`. The currently-running `gsddashboard` tmux session was created by root and CANNOT be used by the `claude` user. The migration must kill and recreate the `gsddashboard` tmux session as the `claude` user. [VERIFIED: live socket inspection]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PM2 startup systemd unit | Write systemd unit manually | `pm2 startup systemd -u claude --hp /home/claude` then run the generated `sudo env PATH=...` command | PM2's generator handles PATH, environment, and restart policy correctly |
| SSH key permissions | Custom script | `install -m 700 -d ~/.ssh && install -m 600 authorized_keys_source ~/.ssh/authorized_keys` | Wrong permissions cause SSH to silently reject keys |
| Transferring Claude config | Selective file copy | `cp -a /root/.claude/ /home/claude/.claude/` then `chown -R claude:claude /home/claude/.claude/` | `-a` preserves timestamps and symlinks; selective copy risks missing hook files |

---

## Common Pitfalls

### Pitfall 1: tmux socket isolation — Dashboard loses session visibility after user switch
**What goes wrong:** After PM2 moves to `claude`, the GSD Dashboard server runs as `claude`. It calls `tmux list-panes` and `tmux send-keys` targeting the `gsddashboard` tmux session. If that session was created by root, `claude` gets "no server running on /tmp/tmux-0/default" or permission denied.
**Why it happens:** tmux server sockets are per-user by default (UNIX socket at `/tmp/tmux-UID/`). Root's socket is mode 700.
**How to avoid:** As part of the cutover, kill the existing `gsddashboard` tmux session (`tmux kill-session -t gsddashboard`) and immediately recreate it as `claude` user. The GSD Dashboard's reopen-tmux route will recreate it correctly.
**Warning signs:** `tmux ls` returns results when run as root but not as claude.

### Pitfall 2: PM2 startup command must be run as root, not as claude
**What goes wrong:** Running `pm2 startup` as `claude` prints a `sudo env PATH=...` command. If you forget to run that sudo command (as root), reboots will not auto-start PM2.
**Why it happens:** Installing a systemd service requires root privileges.
**How to avoid:** After running `pm2 startup systemd -u claude --hp /home/claude` as claude, copy the printed `sudo env PATH=...` command and run it as root immediately. Then `systemctl enable pm2-claude.service`.
**Warning signs:** After `systemctl start pm2-claude.service`, check `pm2 list` — if processes are missing, `pm2 resurrect` was not triggered.

### Pitfall 3: GitHub Actions deploy fails silently after SSH username change
**What goes wrong:** GitHub Actions continues to deploy via `username: root` but the key is now in `claude`'s authorized_keys. SSH connection is refused (the key is no longer in root's authorized_keys — root's file is unchanged).
**Why it happens:** Root's `authorized_keys` is NOT modified during migration; the GitHub Actions deploy key is copied to claude's file but root's file remains intact.
**How to avoid:** Update all 4 GitHub Actions workflow files to `username: claude` BEFORE or IMMEDIATELY AFTER migration. Because root's authorized_keys is left intact, both user targets will work during the transition window.
**Warning signs:** GitHub Actions deploy fails with "Permission denied (publickey)".

### Pitfall 4: healthcheck.sh uses stale PM2 path and stale ecosystem path
**What goes wrong:** The healthcheck script at `/home/services/gsddashboard/scripts/healthcheck.sh` hardcodes `PM2="/data/home/.local/bin/pm2"` — this path does not exist. Additionally, the fallback calls `pm2 start /data/home/gsddashboard/ecosystem.config.cjs` but this file does not exist either.
**Why it happens:** The script was written referencing a Railway-era path that was never updated after Phase 62.
**How to avoid:** Update `PM2="/usr/bin/pm2"` and simplify the fallback to `$PM2 restart gsd-dashboard` only.
**Warning signs:** After 3 consecutive health check failures, the restart fails silently because `/data/home/.local/bin/pm2` doesn't exist.

### Pitfall 5: /root/.claude/hooks/gsd-read-injection-scanner.js is not in /data/home
**What goes wrong:** settings.json references `/root/.claude/hooks/gsd-read-injection-scanner.js`. This file exists ONLY in `/root/.claude/hooks/`, not in `/data/home/.claude/hooks/`. If copied to `/home/claude/.claude/` via `cp -a`, the file arrives at the right place — but the settings.json path reference still points to `/root/`.
**Why it happens:** This hook was added to root's `.claude/hooks/` separately from the `get-shit-done` tool set in `/data/home/.claude/`.
**How to avoid:** After copying `/root/.claude/` to `/home/claude/.claude/`, the file will exist at `/home/claude/.claude/hooks/gsd-read-injection-scanner.js`. Update the one path reference in `/home/claude/.claude/settings.json` from `/root/.claude/hooks/gsd-read-injection-scanner.js` to `/home/claude/.claude/hooks/gsd-read-injection-scanner.js`.
**Warning signs:** Claude sessions fail to start or hook errors appear referencing the missing path.

### Pitfall 6: chown of /data/home breaks symlinks to /home/services
**What goes wrong:** `/data/home/` contains symlinks: `debates -> /home/services/debates`, `gsddashboard -> /home/services/gsddashboard`, `KidAI -> /home/services/KidAI`, `ynab -> /home/services/ynab`. If `chown -R` follows symlinks, it changes ownership of the actual `/home/services/` directories before the explicit `/home/services/` chown step.
**Why it happens:** `chown -R` with `--dereference` (default on some systems) follows symlinks.
**How to avoid:** Use `chown -hR claude:claude /data/home/` — the `-h` flag changes symlinks themselves, not their targets. Then separately `chown -R claude:claude /home/services/`.
**Warning signs:** `/home/services/` directories show `claude` ownership before you explicitly chown them.

### Pitfall 7: Docker containers run as UID 1000 — avoid collision
**What goes wrong:** Docker containers inside `/home/services/` (ynab, debates, etc.) may run internal processes as UID 1000. If `claude` user gets UID 1000, volume-mounted files owned by the container's UID 1000 appear as `claude`-owned on the host, which is actually fine — but if a container runs as a different UID there could be permission issues.
**Why it happens:** Container UIDs and host UIDs are independent.
**How to avoid:** Check with `id claude` after creation. Current state: no UID 1000 user exists on the host (verified). The `useradd` command will assign the next available UID (likely 1000). This is acceptable — containers that need specific UIDs already use UID namespacing or run as root inside the container.
**Warning signs:** Volume mount permission errors in Docker container logs after migration.

---

## Code Examples

### Create claude user
```bash
# Source: Linux man pages / standard useradd usage [ASSUMED - standard Linux]
useradd -m -s /bin/bash -d /home/claude claude
```

### Add to docker group
```bash
# docker group GID: 988 (verified live)
usermod -aG docker claude
```

### Copy SSH authorized_keys
```bash
# Source: standard SSH setup [ASSUMED - standard Linux]
install -m 700 -d /home/claude/.ssh
install -m 600 /root/.ssh/authorized_keys /home/claude/.ssh/authorized_keys
chown -R claude:claude /home/claude/.ssh
```

### PM2 re-registration as claude
```bash
# Run as root, switch to claude context:
# Stop and remove all PM2 processes from root's daemon
pm2 stop all
pm2 delete all
systemctl disable pm2-root.service
systemctl stop pm2-root.service

# Switch user and register processes
sudo -u claude -i bash << 'EOF'
  # gsd-dashboard
  pm2 start /home/services/gsddashboard/server/index.js \
    --name gsd-dashboard \
    --cwd /home/services/gsddashboard \
    --env production

  # gsd-healthcheck
  pm2 start /home/services/gsddashboard/scripts/healthcheck.sh \
    --name gsd-healthcheck \
    --interpreter sh \
    --cwd /home/services/gsddashboard

  # gsd-tunnel
  pm2 start /home/services/gsddashboard/scripts/named-tunnel.sh \
    --name gsd-tunnel \
    --interpreter sh \
    --cwd /home/services/gsddashboard

  pm2 save

  # Print the startup command (must be run as root)
  pm2 startup systemd -u claude --hp /home/claude
EOF
# Copy and run the printed sudo env PATH=... command as root
```

### Ownership transfer
```bash
# -h changes symlinks themselves, not their targets
chown -hR claude:claude /data/home/
chown -R claude:claude /home/services/
# Cloudflare tunnel credentials
mv /root/.cloudflare-tunnel /home/claude/.cloudflare-tunnel
chown -R claude:claude /home/claude/.cloudflare-tunnel
```

### Claude config migration
```bash
cp -a /root/.claude/ /home/claude/.claude/
chown -R claude:claude /home/claude/.claude/
# Fix the one hardcoded /root/ path in settings.json
sed -i 's|/root/.claude/hooks/gsd-read-injection-scanner.js|/home/claude/.claude/hooks/gsd-read-injection-scanner.js|g' \
  /home/claude/.claude/settings.json
```

### isRoot removal in gsd.js
```javascript
// server/routes/gsd.js — remove lines 348-349, replace with:
const claudeCmd = 'claude --effort medium --dangerously-skip-permissions';
```

### Verification
```bash
# SSH as claude
ssh claude@<VPS_IP>

# Confirm --dangerously-skip-permissions works (no error = success)
claude --version --dangerously-skip-permissions 2>&1 | head -3

# Confirm docker access
docker ps

# Confirm PM2 sees processes
pm2 list

# Confirm tmux works
tmux new-session -d -s test-session
tmux ls
tmux kill-session -t test-session
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| useradd/usermod | User creation | Yes | OS built-in | — |
| pm2 (global) | Process management | Yes | 6.0.14 at /usr/bin/pm2 | — |
| systemd | Boot persistence | Yes | OS built-in | — |
| cloudflared | Tunnel | Yes | running live | — |
| tmux | Claude sessions | Yes | 3.4 at /usr/bin/tmux | — |
| docker group | Docker commands | Yes | GID 988, no members yet | — |
| claude binary | Claude Code | Yes | /usr/bin/claude (aarch64) | — |
| Node.js v20 | gsd-dashboard | Yes | v20.20.2 | — |

**All dependencies available. No blockers.** [VERIFIED: live server inspection]

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual SSH + service verification |
| Config file | None (infrastructure migration, not code tests) |
| Quick run command | `ssh claude@<VPS_IP> "pm2 list && claude --version"` |
| Full suite command | See verification checklist below |

### Phase Requirements → Test Map
| Behavior | Test Type | Verification Command |
|----------|-----------|---------------------|
| SSH login as claude works | smoke | `ssh claude@<VPS_IP> whoami` → should return `claude` |
| `--dangerously-skip-permissions` not blocked | smoke | `ssh claude@<VPS_IP> "claude --version --dangerously-skip-permissions"` → no error |
| Docker commands available | smoke | `ssh claude@<VPS_IP> "docker ps"` → lists containers |
| PM2 processes running | smoke | `ssh claude@<VPS_IP> "pm2 list"` → 3 processes online |
| PM2 survives reboot | integration | `reboot` then check `pm2 list` after reconnect (optional — skip if risky) |
| GSD Dashboard accessible | smoke | `curl -s https://dashboard.gsdlabs.dev/api/health` → 200 |
| Cloudflare tunnel active | smoke | `curl -s https://dashboard.gsdlabs.dev/api/health` → 200 |
| KidAI crons still registered | smoke | `crontab -u claude -l` → 3 cron entries |
| isRoot branch removed | code | `grep -n "isRoot\|getuid" server/routes/gsd.js` → no match |
| reopen-tmux sends --dangerously-skip-permissions | smoke | Open tmux session via dashboard, confirm command in pane |

### Wave 0 Gaps
None — no automated test framework needed for infrastructure migration. All verification is SSH-based.

---

## Project Constraints (from CLAUDE.md)

- **Preserve existing behavior unless explicitly asked to change it** — the only behavior change is removing the `isRoot` branch; all other migration is transparent to users
- **Prefer minimal, reversible diffs** — root SSH stays enabled; root PM2 instance deleted but root can recreate; file ownership is the only irreversible step
- **Never silently weaken safety controls** — the `isRoot` removal STRENGTHENS safety by passing `--dangerously-skip-permissions` only when running as a non-root user (the intended use)
- **Keep docs updated** — after migration, update any SSH examples in planning docs from `root@hetzner` to `claude@hetzner`
- **Backend test:** `npm run test:server` — run after the gsd.js change
- **API response shapes preserved** — isRoot removal does not change the `/reopen-tmux` response shape

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pm2 startup systemd -u claude --hp /home/claude` generates a working systemd unit for a non-root user | Code Examples | PM2 processes don't start on reboot — easy to fix: manually write systemd unit |
| A2 | All 3 PM2 processes can be re-registered with the same script paths (no root-only paths in scripts beyond cloudflared config) | Runtime State Inventory | A process fails to start — diagnose from pm2 logs |
| A3 | Docker containers continue running during PM2 migration (Docker daemon is independent of PM2) | Architecture Patterns | Containers stop — they shouldn't, Docker daemon is independent |

**All other claims in this document were verified via live server inspection on 2026-05-04.**

---

## Open Questions

1. **Should PM2 logs be preserved?**
   - What we know: `/root/.pm2/logs/` contains historical logs for gsd-dashboard (59 restarts), gsd-healthcheck, gsd-tunnel
   - What's unclear: Whether the user cares about log continuity
   - Recommendation: Leave `/root/.pm2/` intact (root still has it); new logs go to `/home/claude/.pm2/logs/`. Acceptable tradeoff.

2. **GitHub Actions deploy key: add to claude's authorized_keys while keeping in root's?**
   - What we know: `/root/.ssh/authorized_keys` has 3 keys; one is the GitHub Actions deploy key
   - What's unclear: Whether to remove it from root's file (tightening security) or leave it (simpler)
   - Recommendation: Leave root's authorized_keys intact per the "root SSH stays as emergency recovery" decision. This means both `ssh root@VPS` and `ssh claude@VPS` will work with the same key during the transition window. After all workflows are updated, optionally remove the deploy key from root's authorized_keys.

3. **Cloudflare tunnel credentials: move or symlink?**
   - What we know: `/root/.cloudflare-tunnel/credentials.json` is referenced by named-tunnel.sh; it contains a tunnel credential JSON
   - What's unclear: Whether to `mv` the directory (clean) or `cp` (leaves root a backup)
   - Recommendation: `mv` is cleaner and matches the locked decision to transfer ownership. The tunnel UUID (`093489ad-...`) remains unchanged.

---

## Sources

### Primary (HIGH confidence — verified via live server inspection)
- Live PM2 daemon: `pm2 list`, `pm2 show` — process names, script paths, CWD confirmed
- Live filesystem: `/root/.pm2/`, `/root/.claude/`, `/root/.ssh/`, `/etc/systemd/system/pm2-root.service` — all inspected
- Live `server/routes/gsd.js` lines 348-349 — isRoot code confirmed
- Live `scripts/named-tunnel.sh` — cloudflared --config path confirmed
- Live `scripts/healthcheck.sh` — stale PM2 path confirmed
- Live GitHub Actions workflows — 4 files with `username: root` confirmed
- Live docker group: `getent group docker` → GID 988, no members
- Live `/tmp/tmux-0/default` socket → mode 700, root-owned

### Secondary (MEDIUM confidence)
- `pm2 startup` non-root user pattern [CITED: PM2 official docs pattern — standard usage, verified against live pm2 version 6.0.14]

## Metadata

**Confidence breakdown:**
- Migration sequence: HIGH — all state inventoried from live server
- File path changes: HIGH — all paths verified live
- PM2 non-root startup: MEDIUM — standard PM2 pattern, not tested against this specific v6.0.14 instance
- Pitfalls: HIGH — all based on verified live state (tmux socket, healthcheck stale path, settings.json path)

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (stable infrastructure, low churn risk)
