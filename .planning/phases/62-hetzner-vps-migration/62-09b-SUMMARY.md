---
phase: 62-hetzner-vps-migration
plan: 09b
subsystem: infra
tags: [claude-code, vps, gsd, migration, arm64, pm2]

requires:
  - phase: 62-08
    provides: "Nightly backup container running on VPS (B2 uploads verified)"

provides:
  - "Claude Code v2.1.121 installed on VPS (ARM64 aarch64)"
  - "GSD v1.36.0 installed at /data/home/.claude/get-shit-done/ on VPS (SCP from Railway)"
  - "All active projects cloned/symlinked under /data/home/ on VPS"
  - "All project .env files present on VPS"
  - "Global Claude Code hooks active in /root/.claude/settings.json (34 hooks)"
  - "GSD Dashboard local mode active (no GSD_DATA_URL, reads /root/.claude/)"
  - "GSD Dashboard auth-gated (DASHBOARD_PASS set, 401 on wrong password)"
  - "ANTHROPIC_API_KEY available in /data/home/.env for claude first-run auth"

affects: [62-10-railway-teardown]

tech-stack:
  added:
    - "@anthropic-ai/claude-code v2.1.121 (npm global on VPS)"
    - "GSD v1.36.0 (SCP from Railway, /data/home/.claude/get-shit-done/)"
  patterns:
    - "GSD installed via SCP not npm (no npm package exists for gsd-for-claude)"
    - "Projects at /data/home/ use symlinks to /home/services/ for existing services"
    - "New projects cloned directly to /data/home/ (reforma)"
    - "Global hooks path stays /data/home/.claude/hooks/ (settings.json paths are absolute literals)"
    - "DASHBOARD_PASS = VPS-specific auth (different from Railway which has no password)"

key-files:
  created:
    - "/data/home/ (VPS workspace root — created)"
    - "/data/home/.env (SCPd from Railway — contains ANTHROPIC_API_KEY)"
    - "/data/home/CLAUDE.md (SCPd from Railway — global project instructions)"
    - "/data/home/.claude/get-shit-done/ (GSD SCPd from Railway)"
    - "/data/home/.claude/hooks/ (Claude Code hook scripts SCPd from Railway)"
    - "/data/home/.claude/skills/ (GSD skills SCPd from Railway)"
    - "/data/home/reforma/ (cloned from manuelkuhs/reforma — was empty at /home/services)"
    - "/root/.claude/ (created — Claude Code user data directory for root user)"
    - "/root/.claude/settings.json (global Claude Code settings with 34 hooks)"
  modified:
    - "/home/services/gsddashboard/.env (DASHBOARD_PASS added for auth gate)"
    - "/data/home/.env (ANTHROPIC_API_KEY appended for claude first-run)"
  symlinked:
    - "/data/home/gsddashboard → /home/services/gsddashboard (PM2 source)"
    - "/data/home/debates → /home/services/debates (Docker service source)"
    - "/data/home/ynab → /home/services/ynab (Docker service source)"

key-decisions:
  - "GSD via SCP not npm: gsd-for-claude does NOT exist on npm; SCP from Railway is the only install method"
  - "Debates/ynab symlinked (not re-cloned): both exist at /home/services/ from Plans 05-06; symlinks keep one source of truth"
  - "Reforma cloned fresh: /home/services/reforma was empty (not used as a service); cloned directly to /data/home/reforma"
  - "gsddashboard symlinked to /home/services/gsddashboard: PM2 still points to /home/services/; symlink keeps paths consistent"
  - "DASHBOARD_PASS added as VPS-specific auth: Railway dashboard has no password (single-user local); VPS needs auth since dashboard.gsdlabs.dev is public"
  - "Hook paths unchanged: /root/.claude/settings.json copied as-is from Railway; hook scripts are at /data/home/.claude/hooks/ which is created on VPS too — paths stay valid"
  - "GitHub PAT redacted from history: PAT appeared in 62-05-SUMMARY.md at commit 740647f — redacted via git filter-branch before push; GitHub push protection was blocking"

patterns-established:
  - "Pattern: git filter-branch to redact secrets before GitHub push (git filter-branch -f --tree-filter 'sed -i ...' origin/master..HEAD)"
  - "Pattern: pm2 restart --update-env required when ecosystem uses env_file and .env changes (plain pm2 restart doesn't re-read env_file)"
  - "Pattern: PM2 process inherits HOME=/root when started as root; os.homedir() resolves to /root; dashboard reads /root/.claude/projects/ correctly"

requirements-completed: []

duration: 41min
completed: 2026-04-28
---

# Phase 62 Plan 09b: Claude CLI / GSD Workspace Migration to VPS — Summary

**Claude Code v2.1.121 installed on Hetzner CAX21 ARM64 VPS; all active projects cloned under /data/home/; GSD v1.36.0 SCP'd from Railway; dashboard auth-gated with DASHBOARD_PASS; local mode verified (reads /root/.claude/ not Railway)**

## Performance

- **Duration:** ~41 min
- **Started:** 2026-04-28T10:11:36Z
- **Completed:** 2026-04-28T10:53:00Z
- **Tasks:** 3/4 automated complete (Task 4 is human verification)
- **Files modified:** VPS-only (env files, symlinks, /root/.claude/, /data/home/ workspace)

## Accomplishments

- Synced all Railway projects to GitHub (Task 0): redacted PAT from 62-05-SUMMARY.md commit history, force-pushed clean history, committed agents + UI assets for gsddashboard, debates .claude/.planning state, reforma pipeline changes — all 4 projects at 0 ahead
- Installed Claude Code v2.1.121 on VPS via `npm install -g @anthropic-ai/claude-code` — ARM64 binary selected correctly by postinstall
- Created `/data/home/` workspace on VPS
- SCP'd GSD v1.36.0 to `/data/home/.claude/get-shit-done/` (npm package does not exist — SCP from Railway is the install method)
- SCP'd global hooks to `/data/home/.claude/hooks/` and `/data/home/.claude/skills/`
- Copied `/root/.claude/settings.json` from Railway (34 hooks registered)
- Symlinked gsddashboard, debates, ynab from `/home/services/` to `/data/home/`
- Cloned reforma fresh to `/data/home/reforma` (was empty at /home/services/reforma)
- SCP'd all env files: `/data/home/.env`, `CLAUDE.md`, project `.env` files for all 4 projects + KidAI
- Added ANTHROPIC_API_KEY to `/data/home/.env` on VPS for Claude Code first-run auth
- Set up GSD symlinks in all 4 projects (`/data/home/*/. claude/get-shit-done → /data/home/.claude/get-shit-done`)
- Disabled proxy mode: GSD_DATA_URL not set; dashboard reads local `/root/.claude/` via `os.homedir()`
- Added DASHBOARD_PASS to VPS .env for public-facing auth gate
- Restarted PM2 with `--update-env` to pick up new env vars
- Verified: `/api/health` = 200, wrong-password login = 401, `/api/gsd/projects` shows all 4 projects with live state data

## Verification Results

| Check | Result |
|-------|--------|
| `ssh root@37.27.212.18 "claude --version"` | `2.1.121 (Claude Code)` ✓ |
| `ssh root@37.27.212.18 "node --version"` | `v20.20.2` ✓ |
| `ssh root@37.27.212.18 "ls -d /data/home/{gsddashboard,debates,ynab,reforma}"` | All 4 directories present ✓ |
| `ssh root@37.27.212.18 "ls /data/home/.env /data/home/CLAUDE.md"` | Both present ✓ |
| `curl http://localhost:4820/api/health` | `{"status":"ok",...}` HTTP 200 ✓ |
| Wrong password login (POST /api/auth/login) | HTTP 401 ✓ |
| `pm2 env 1 \| grep GSD_DATA_URL` | Not set — local mode active ✓ |
| `/api/gsd/projects` | Returns gsddashboard, debates, reforma, ynab with live state ✓ |
| `ls /data/home/.claude/get-shit-done/bin/gsd-tools.cjs` | Exists ✓ |
| `cat /root/.claude/settings.json \| grep -c hook` | 34 ✓ |

## Task Results

### Task 0: Sync Railway projects to GitHub

- **Blocker encountered:** GitHub push protection blocked push due to GitHub PAT (`ghp_REDACTED`) embedded in `62-05-SUMMARY.md` commit 740647f
- **Resolution:** Used `git filter-branch -f --tree-filter 'sed -i ...'` to rewrite 8 commits and redact the PAT; force-pushed clean history with `--force-with-lease`
- **Committed:** gsddashboard agents + UI assets; debates .claude/.planning state; reforma pipeline changes
- **Result:** All 4 projects at 0 commits ahead of GitHub

**Commit:** `350a133` — chore(62-09b): sync all Railway projects to GitHub before VPS migration

### Task 1: Install Node.js 20+, Claude Code, GSD on VPS

- Node.js v20.20.2 already installed (from Plan 01)
- Claude Code v2.1.121 installed via npm (ARM64 binary selected correctly — no architecture detection issues on Hetzner CAX21 + Ubuntu 24.04)
- GSD: `npm install -g gsd-for-claude` skipped (package doesn't exist) — SCP'd directly from Railway in Task 2
- `/data/home/` created on VPS

### Task 2: Clone projects; SCP env files

- gsddashboard: symlinked `/home/services/gsddashboard → /data/home/gsddashboard` (PM2 source is /home/services/)
- debates: symlinked `/home/services/debates → /data/home/debates` (already cloned in Plan 05)
- ynab: symlinked `/home/services/ynab → /data/home/ynab` (already cloned in Plan 06)
- reforma: cloned fresh to `/data/home/reforma` — `/home/services/reforma` was empty (not a deployed service)
- SCP'd: `/data/home/.env`, `CLAUDE.md`, `gsddashboard/.env`, `ynab/.env.local`, `reforma/.env`, `reforma/.env.local`, `KidAI/.env.local`
- Copied `/root/.claude/settings.json` with 34 hook entries
- Added ANTHROPIC_API_KEY to `/data/home/.env` on VPS (was in `gsddashboard/.env` but not global `.env`)
- GSD symlinks created for gsddashboard and reforma (debates and ynab already had them from Plans 05-06)

### Task 3: Fix GSD Dashboard — disable proxy mode, enable auth

- GSD_DATA_URL was already NOT set in `.env` (proxy mode was inactive but dashboard was using a stale cached proxy response from a previous PM2 start)
- `pm2 restart --update-env` cleared the stale environment — local mode confirmed active
- Added `DASHBOARD_PASS` (24-char generated password) to VPS `.env`
- PM2 restarted with `--update-env` → auth gate active
- `/api/gsd/projects` confirmed returning live local project data (9 projects shown, including gsddashboard, debates, reforma, ynab)

**Commit:** `b003b29` — feat(62-09b): install Claude Code + GSD on VPS; migrate all projects

### Task 4 (human): Start first Claude session on VPS

**Status:** AWAITING USER — Human verification required.

User needs to:
1. SSH into VPS: `ssh root@37.27.212.18`
2. Source env: `source /data/home/.env`
3. Start tmux: `tmux new-session -s gsddashboard -c /data/home/gsddashboard`
4. Run Claude: `source /data/home/.env && claude`
5. On first run: confirm API key usage when prompted (one-time)
6. Visit https://dashboard.gsdlabs.dev — log in with DASHBOARD_PASS from `/home/services/gsddashboard/.env`
7. Confirm the gsddashboard project appears as active within 30 seconds

**Dashboard password:** In `/home/services/gsddashboard/.env` as `DASHBOARD_PASS=...` on VPS.

## VPS Project Inventory

| Project | Location on VPS | Git SHA | Type |
|---------|----------------|---------|------|
| gsddashboard | /data/home/gsddashboard → /home/services/gsddashboard | b003b29 | symlink |
| debates | /data/home/debates → /home/services/debates | 103f68d | symlink |
| ynab | /data/home/ynab → /home/services/ynab | 5f3ac0a | symlink |
| reforma | /data/home/reforma | 1b71f62 | direct clone |

## Env Files Copied to VPS

| File | Destination | Status |
|------|-------------|--------|
| /data/home/.env | /data/home/.env | ✓ (+ ANTHROPIC_API_KEY appended) |
| /data/home/CLAUDE.md | /data/home/CLAUDE.md | ✓ |
| /data/home/gsddashboard/.env | /home/services/gsddashboard/.env | ✓ (+ DASHBOARD_PASS appended) |
| /data/home/ynab/.env.local | /home/services/ynab/.env.local | ✓ |
| /data/home/reforma/.env | /data/home/reforma/.env | ✓ |
| /data/home/reforma/.env.local | /data/home/reforma/.env.local | ✓ |
| /data/home/KidAI/.env.local | /home/services/KidAI/.env.local | ✓ |

## Decisions Made

1. **GSD via SCP (not npm):** `gsd-for-claude` does not exist on npm — SCP from Railway is the install method
2. **Debates/ynab symlinked:** Both live at `/home/services/` from Plans 05-06; symlinks preserve single source of truth
3. **Reforma cloned fresh:** `/home/services/reforma` was empty (not a deployed Docker service); cloned to `/data/home/reforma`
4. **DASHBOARD_PASS added:** VPS dashboard at `dashboard.gsdlabs.dev` is public; requires auth. Railway dashboard was no-auth (local machine). Generated 24-char password.
5. **Hook paths unchanged:** settings.json copied as-is; hooks at `/data/home/.claude/hooks/` created on VPS — absolute paths remain valid
6. **pm2 restart --update-env:** Plain `pm2 restart` doesn't re-read env_file; `--update-env` required to pick up `.env` changes in PM2 ecosystem config

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GitHub push protection blocked push due to PAT in 62-05-SUMMARY.md**
- **Found during:** Task 0 (git push step)
- **Issue:** Commit 740647f had literal PAT (ghp_REDACTED) in planning docs. GitHub rejected push.
- **Fix:** `git filter-branch -f --tree-filter 'sed -i ...'` to rewrite 8 commits; redacted PAT to `ghp_REDACTED`; force-pushed with `--force-with-lease`. Also redacted from 62-09b-PLAN.md (which also had it in bash scripts) before its first push.
- **Files modified:** `.planning/phases/62-hetzner-vps-migration/62-05-SUMMARY.md` (in git history), `62-09b-PLAN.md`
- **Commit:** Force-push to GitHub; new HEAD at a1a4200 then 350a133

**2. [Rule 1 - Discovery] pm2 restart doesn't re-read env_file without --update-env**
- **Found during:** Task 3 (restart PM2 to disable proxy mode)
- **Issue:** `pm2 restart gsd-dashboard` printed "Use --update-env to update environment variables"; env changes not picked up
- **Fix:** Used `pm2 restart gsd-dashboard --update-env` — env re-read from `.env` file
- **Impact:** Critical — without this, DASHBOARD_PASS and GSD_DATA_URL removal would not take effect

**3. [Rule 2 - Missing critical functionality] ANTHROPIC_API_KEY not in /data/home/.env**
- **Found during:** Task 2 verification (ANTHROPIC_API_KEY grep returned 0)
- **Issue:** `/data/home/.env` did not contain `ANTHROPIC_API_KEY` (it was in `gsddashboard/.env`). Task 4 requires `source /data/home/.env && claude` to work without manual key entry.
- **Fix:** Appended `ANTHROPIC_API_KEY=...` to `/data/home/.env` on VPS from gsddashboard .env value
- **Impact:** Task 4 would have blocked without this

**4. [Rule 1 - Discovery] Reforma was not at /home/services/reforma (empty dir)**
- **Found during:** Task 2 (checking /home/services/ contents before symlinking)
- **Issue:** Plan assumed all projects existed at /home/services/; reforma directory was empty (no git repo there — it's not deployed as a Docker service on VPS)
- **Fix:** Cloned reforma fresh from manuelkuhs/reforma to `/data/home/reforma` directly
- **Impact:** None — clone worked cleanly with latest commit (1b71f62)

**5. [Rule 2 - Missing critical functionality] DASHBOARD_PASS not in any existing env**
- **Found during:** Task 3 (checking for existing password config)
- **Issue:** Plan said to "Add AUTH_REQUIRED=true and DASHBOARD_PASSWORD" but the server uses `DASHBOARD_PASS` (not `DASHBOARD_PASSWORD` or `AUTH_REQUIRED`). Neither was set on Railway or VPS. Dashboard was in no-auth mode.
- **Fix:** Generated a 24-char random password, added `DASHBOARD_PASS=...` to `/home/services/gsddashboard/.env`; saved same value to Railway `.env` for reference. Restarted PM2 with `--update-env`.
- **Threat mitigation:** T-62-33 (auth bypass if AUTH_REQUIRED missing) — now mitigated

## Known Stubs

- **Task 4 (human verification):** The plan has a human task (tmux Claude session on VPS) that was not auto-executed. The infrastructure is fully ready; this requires the user to SSH into VPS and start a Claude session.

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-62-32: Env file disclosure | chmod 600 preserved on /home/services/gsddashboard/.env; SCP over SSH (encrypted) ✓ |
| T-62-33: Auth bypass if DASHBOARD_PASS missing | DASHBOARD_PASS set; 401 on wrong password confirmed ✓ |
| T-62-31: GitHub PAT in git remote URLs | PAT removed from planning docs in commit history (filter-branch); single-user VPS SSH-only ✓ |

## Threat Flags

None — no new network endpoints or trust boundaries introduced beyond plan scope.

## Self-Check: PASSED

- [x] VPS: `ssh root@37.27.212.18 "claude --version"` → 2.1.121
- [x] VPS: `ls -d /data/home/{gsddashboard,debates,ynab,reforma}` → all present
- [x] VPS: `curl http://localhost:4820/api/health` → HTTP 200
- [x] VPS: wrong-password login → HTTP 401 (auth active)
- [x] VPS: `/api/gsd/projects` returns 9 projects with live state data
- [x] Local: commit b003b29 exists on master

---
*Phase: 62-hetzner-vps-migration*
*Completed: 2026-04-28*
