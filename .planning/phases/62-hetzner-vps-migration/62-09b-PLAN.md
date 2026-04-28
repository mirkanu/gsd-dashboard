---
phase: 62-hetzner-vps-migration
plan: 09b
type: execute
wave: 8b
depends_on: [62-08]
files_modified:
  - /data/home/ (on VPS — project workspace created)
  - /root/.claude/settings.json (on VPS — global Claude Code hooks installed)
  - /home/services/gsddashboard/.env (on VPS — AUTH_REQUIRED + correct data path added)
autonomous: false
requirements: []

must_haves:
  truths:
    - "Claude Code is installed on VPS via npm (claude --version succeeds as root)"
    - "GSD is installed globally on VPS (/data/home/.claude/get-shit-done/ exists)"
    - "All active projects are cloned under /data/home/ on VPS (gsddashboard, debates, ynab, reforma)"
    - "Env files for all projects are present on VPS (copied from Railway via SCP)"
    - "Global Claude Code hooks are installed on VPS (/root/.claude/settings.json has hook entries)"
    - "GSD Dashboard on VPS requires password (AUTH_REQUIRED=true in env)"
    - "GSD Dashboard on VPS shows live projects after a test Claude session is started in tmux"
  artifacts:
    - path: "/data/home/gsddashboard/ (on VPS)"
      provides: "GSD Dashboard project with updated .env (AUTH_REQUIRED, correct data path)"
      contains: "AUTH_REQUIRED=true DASHBOARD_PASSWORD"
    - path: "/root/.claude/settings.json (on VPS)"
      provides: "Global Claude Code hooks — fires for every Claude session on VPS"
      contains: "gsd-context-monitor gsd-session-state gsd-statusline hooks"
  key_links:
    - from: "Claude Code session (any project on VPS)"
      to: "/root/.claude/projects/ (hook data)"
      via: "global hooks in /root/.claude/settings.json"
      pattern: "GSD_DASHBOARD_URL=http://localhost:4820"
    - from: "GSD Dashboard (PM2, port 4820)"
      to: "/root/.claude/projects/ (hook data)"
      via: "server/routes reading ~/.claude/projects/"
      pattern: "AUTH_REQUIRED=true"
---

<objective>
Migrate the Claude CLI workspace from Railway to Hetzner VPS. Install Claude Code on VPS via npm,
create the /data/home/ project workspace, clone all active projects from GitHub, copy env files,
install GSD globally, configure Claude Code hooks, and verify the GSD Dashboard shows live sessions.

Purpose: This is the final infrastructure piece. The web services are on VPS (Plans 01-08), but
Claude Code sessions still run on Railway — the most expensive part. After this plan, all work
happens on VPS, Railway is idle, and Plan 09 parallel-run validation can begin properly.
Output: VPS is the new Claude CLI home. GSD Dashboard shows live sessions. Railway Claude machine
is idle. Plan 09 validation can proceed.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/data/home/gsddashboard/.planning/phases/62-hetzner-vps-migration/62-CONTEXT.md
@/data/home/gsddashboard/.planning/phases/62-hetzner-vps-migration/62-04-SUMMARY.md

VPS IP: 37.27.212.18
VPS user: root
GSD Dashboard PM2: gsd-dashboard (port 4820), started in Plan 04

Railway machine (this machine): /data/home/ workspace with all projects
Active projects to migrate (GitHub remotes exist):
  - gsddashboard  → mirkanu/gsd-dashboard
  - debates       → mirkanu/christiandebates
  - ynab          → mirkanu/ynab-automation
  - reforma       → manuelkuhs/reforma

Projects without GitHub remotes (skip for now):
  - GameMCP (local only, no remote)
  - gsdTelegram (local only, no remote)

Env files to SCP from Railway → VPS:
  - /data/home/.env                 → /data/home/.env
  - /data/home/gsddashboard/.env    → /data/home/gsddashboard/.env
  - /data/home/ynab/.env.local      → /data/home/ynab/.env.local
  - /data/home/reforma/.env         → /data/home/reforma/.env
  - /data/home/reforma/.env.local   → /data/home/reforma/.env.local
  - /data/home/KidAI/.env.local     → /home/services/KidAI/.env.local (KidAI already at /home/services)

Global CLAUDE.md (not in any git repo) to copy:
  - /data/home/CLAUDE.md → /data/home/CLAUDE.md on VPS

NOTE: GSD Dashboard is already running on VPS from Plan 04 (PM2 gsd-dashboard process).
Its source is cloned somewhere under /home/services/ — check location before cloning again.
We will UPDATE its .env in place rather than re-clone.

NOTE: Claude Code hook data lives in ~/.claude/projects/ — on VPS as root, that is
/root/.claude/projects/. The GSD Dashboard server must read from this path.
The GSD_DATA_URL env var controls whether Dashboard runs in proxy mode (points to Railway)
or local mode (reads from local ~/.claude/). After this plan, GSD_DATA_URL must be UNSET
or set to a local value so the VPS Dashboard reads local hook data.
</context>

<tasks>

<task type="auto">
  <name>Task 0: Commit and push all Railway projects so VPS clone gets complete state</name>
  <read_first>None — git operations only</read_first>
  <files>
    Commits to: gsddashboard, debates, reforma (Railway machine — pushed to GitHub)
  </files>
  <action>
Current state (as of plan creation):
- gsddashboard: 7 commits ahead of GitHub + uncommitted changes (index.html, og-image.svg, untracked .claude/agents/)
- debates: .claude/ and .planning/ are tracked but have untracked files (.claude/, .planning/debug/, etc.)
- reforma: modified files not committed (data/candidate_manifest.jsonl, two .py files)
- ynab: clean — nothing to do

Step 1 — Push gsddashboard's 7 ahead commits, then commit and push remaining changes:
```bash
cd /data/home/gsddashboard

# Push the 7 existing ahead commits first
git push

# Stage and commit the remaining changes
git add index.html og-image.svg
git add .claude/agents/
git status  # review before committing
git commit -m "chore: sync agents and UI assets to GitHub before VPS migration"
git push
```

Step 2 — Commit untracked GSD/planning files in debates:
```bash
cd /data/home/debates
git add .claude/ .planning/debug/ .planning/phases/41-configurable-source-registry/.gitkeep .bg-shell/ .gsd/ 2>/dev/null || true
git status  # review
git diff --cached --stat
# Only commit if there's something meaningful — skip if it's all temp/cache files
git commit -m "chore: sync .claude and .planning state to GitHub before VPS migration" 2>/dev/null || echo "Nothing to commit in debates"
git push 2>/dev/null || echo "No remote or nothing to push in debates"
```

Step 3 — Commit modified files in reforma:
```bash
cd /data/home/reforma
git add data/candidate_manifest.jsonl ingestion/benchmark_retrieval.py ingestion/run_full_pipeline.py
git status
git commit -m "chore: sync pipeline changes to GitHub before VPS migration"
git push
```

Step 4 — Final verification: all projects at 0 ahead:
```bash
for proj in gsddashboard debates ynab reforma; do
  dir="/data/home/$proj"
  [ -d "$dir/.git" ] || continue
  AHEAD=$(git -C "$dir" rev-list @{u}..HEAD 2>/dev/null | wc -l || echo "?")
  echo "$proj: $AHEAD commits ahead of GitHub"
done
# All should show 0
```
  </action>
  <verify>
    <automated>for proj in gsddashboard debates ynab reforma; do git -C /data/home/$proj rev-list @{u}..HEAD 2>/dev/null | wc -l; done</automated>
    <!-- All should output 0 -->
  </verify>
  <done>
    - `git -C /data/home/gsddashboard rev-list @{u}..HEAD | wc -l` → 0
    - `git -C /data/home/debates rev-list @{u}..HEAD | wc -l` → 0
    - `git -C /data/home/reforma rev-list @{u}..HEAD | wc -l` → 0
    - `git -C /data/home/ynab rev-list @{u}..HEAD | wc -l` → 0
    - No uncommitted tracked-file changes in any project (`git status --short` shows no M lines)
  </done>
</task>

<task type="auto">
  <name>Task 1: Install Node.js 20+, Claude Code, and GSD on VPS; create /data/home/ workspace</name>
  <read_first>
    - /data/home/gsddashboard/.planning/phases/62-hetzner-vps-migration/62-04-SUMMARY.md (existing PM2 setup on VPS)
  </read_first>
  <files>
    /data/home/ directory (on VPS — created)
    /root/.claude/settings.json (on VPS — created/updated with global hooks)
  </files>
  <action>
Step 1 — SSH in and check existing state:
```bash
ssh root@37.27.212.18 << 'CHECKEOF'
echo "=== Node version ===" && node --version 2>/dev/null || echo "Node not found"
echo "=== npm version ===" && npm --version 2>/dev/null || echo "npm not found"
echo "=== Claude CLI ===" && claude --version 2>/dev/null || echo "Claude not installed"
echo "=== PM2 gsd-dashboard ===" && pm2 list | grep gsd-dashboard || echo "not in pm2"
echo "=== GSD Dashboard source ===" && pm2 show gsd-dashboard 2>/dev/null | grep "exec path\|cwd" || true
echo "=== /data/home exists ===" && ls /data/home/ 2>/dev/null || echo "/data/home does not exist"
echo "=== /home/services ===" && ls /home/services/ 2>/dev/null | head -10
CHECKEOF
```

Step 2 — Install Node.js 20 if not present (or if version < 20):
```bash
ssh root@37.27.212.18 << 'NODEEOF'
set -eux
# Check if Node 20+ is installed
NODE_VER=$(node --version 2>/dev/null | grep -oP '\d+' | head -1 || echo "0")
if [ "$NODE_VER" -lt 20 ]; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  node --version
  npm --version
else
  echo "Node $NODE_VER already installed — OK"
fi
NODEEOF
```

Step 3 — Install Claude Code via npm:
```bash
ssh root@37.27.212.18 << 'CLAUDEEOF'
set -eux
npm install -g @anthropic-ai/claude-code
claude --version
echo "Claude Code installed OK"
CLAUDEEOF
```

Step 4 — Create /data/home/ workspace directory:
```bash
ssh root@37.27.212.18 << 'MKDIREOF'
set -eux
mkdir -p /data/home
echo "/data/home created"
ls /data/home/
MKDIREOF
```

Step 5 — Install GSD globally on VPS:
```bash
ssh root@37.27.212.18 << 'GSDEOF'
set -eux
mkdir -p /data/home/.claude
cd /data/home/.claude

# Clone GSD into the canonical location
if [ -d "get-shit-done" ]; then
  echo "GSD already installed — pulling latest"
  git -C get-shit-done pull
else
  # Install GSD via npm init or clone from the installed version on Railway
  # GSD is installed as a global Claude skill package — check if npx can install it
  # Use the version number from Railway machine (v1.36.0)
  npm install -g gsd-for-claude 2>/dev/null || true
  # If npm fails, we'll copy via SCP in Task 2
  echo "GSD npm install attempted"
fi
GSDEOF
```

NOTE: If GSD npm install fails (package name may differ), skip — Task 2 will SCP it from Railway.
  </action>
  <verify>
    <automated>ssh root@37.27.212.18 "claude --version && echo ok"</automated>
  </verify>
  <done>
    - `ssh root@37.27.212.18 "claude --version"` exits 0 and prints a version number
    - `ssh root@37.27.212.18 "node --version"` shows v20.x or higher
    - `ssh root@37.27.212.18 "ls /data/home/"` exits 0 (directory exists, may be empty)
    - PM2 gsd-dashboard source location recorded (from `pm2 show gsd-dashboard` output)
  </done>
</task>

<task type="auto">
  <name>Task 2: Clone projects from GitHub; SCP env files and global CLAUDE.md from Railway to VPS</name>
  <read_first>
    - /data/home/gsddashboard/.planning/phases/62-hetzner-vps-migration/62-04-SUMMARY.md (where gsddashboard was cloned on VPS)
  </read_first>
  <files>
    /data/home/gsddashboard/ (on VPS — cloned or symlinked from existing PM2 location)
    /data/home/debates/ (on VPS — cloned)
    /data/home/ynab/ (on VPS — cloned)
    /data/home/reforma/ (on VPS — cloned)
    /data/home/.env (on VPS — SCPd)
    /data/home/CLAUDE.md (on VPS — SCPd)
    All project .env files (on VPS — SCPd)
  </files>
  <action>
Step 1 — Determine where gsddashboard lives on VPS (from Task 1 output) and handle it:
If gsd-dashboard is already cloned to e.g. `/home/services/gsddashboard`, either:
- Symlink: `ln -s /home/services/gsddashboard /data/home/gsddashboard`
- Or clone fresh to `/data/home/gsddashboard` and update PM2 to point there

The simplest approach: if it exists, create a symlink; otherwise clone fresh.

```bash
GSD_SRC=$(ssh root@37.27.212.18 "pm2 show gsd-dashboard 2>/dev/null | grep 'cwd' | awk '{print \$4}'" 2>/dev/null || echo "")
echo "GSD Dashboard source: $GSD_SRC"

ssh root@37.27.212.18 << LINKEOF
set -eux
GSD_SRC="$GSD_SRC"
if [ -n "\$GSD_SRC" ] && [ -d "\$GSD_SRC" ] && [ "\$GSD_SRC" != "/data/home/gsddashboard" ]; then
  echo "Symlinking \$GSD_SRC → /data/home/gsddashboard"
  ln -sfn "\$GSD_SRC" /data/home/gsddashboard
elif [ -d "/data/home/gsddashboard" ]; then
  echo "/data/home/gsddashboard already exists — OK"
else
  echo "Cloning gsd-dashboard fresh..."
  git clone https://ghp_REDACTED@github.com/mirkanu/gsd-dashboard.git /data/home/gsddashboard
fi
ls -la /data/home/gsddashboard/
LINKEOF
```

Step 2 — Clone remaining projects from GitHub:
```bash
ssh root@37.27.212.18 << 'CLONEEOF'
set -eux
TOKEN="ghp_REDACTED"

clone_or_pull() {
  local repo=$1
  local dest=$2
  if [ -d "$dest/.git" ]; then
    echo "Pulling latest: $dest"
    git -C "$dest" pull
  else
    echo "Cloning $repo → $dest"
    git clone "https://$TOKEN@github.com/$repo.git" "$dest"
  fi
}

clone_or_pull "mirkanu/christiandebates"  /data/home/debates
clone_or_pull "mirkanu/ynab-automation"   /data/home/ynab
clone_or_pull "manuelkuhs/reforma"        /data/home/reforma

echo "=== Cloned projects ==="
ls /data/home/
CLONEEOF
```

Step 3 — SCP env files from Railway → VPS:
```bash
# SCP all env files. Run from this Railway machine.
VPS="root@37.27.212.18"

# Global
scp /data/home/.env                $VPS:/data/home/.env
scp /data/home/CLAUDE.md           $VPS:/data/home/CLAUDE.md

# Per-project
scp /data/home/gsddashboard/.env   $VPS:/data/home/gsddashboard/.env  2>/dev/null || true
scp /data/home/ynab/.env.local     $VPS:/data/home/ynab/.env.local     2>/dev/null || true
scp /data/home/reforma/.env        $VPS:/data/home/reforma/.env        2>/dev/null || true
scp /data/home/reforma/.env.local  $VPS:/data/home/reforma/.env.local  2>/dev/null || true
scp /data/home/KidAI/.env.local    $VPS:/home/services/KidAI/.env.local 2>/dev/null || true

echo "Env files copied."
```

Step 4 — Copy global Claude Code settings (hooks) from Railway → VPS:
```bash
# /data/home/.claude/settings.json is the global Claude Code config on Railway (HOME=/data/home)
# On VPS (root user), Claude Code reads from /root/.claude/settings.json
scp /data/home/.claude/settings.json root@37.27.212.18:/root/.claude/settings.json 2>/dev/null || \
  ssh root@37.27.212.18 "mkdir -p /root/.claude"
scp /data/home/.claude/settings.json root@37.27.212.18:/root/.claude/settings.json

echo "Global Claude hooks copied."
```

Step 5 — SCP GSD if npm install failed in Task 1:
```bash
GSD_EXISTS=$(ssh root@37.27.212.18 "ls /data/home/.claude/get-shit-done/bin/gsd-tools.cjs 2>/dev/null && echo yes || echo no")
if [ "$GSD_EXISTS" != "yes" ]; then
  echo "Copying GSD from Railway..."
  ssh root@37.27.212.18 "mkdir -p /data/home/.claude"
  scp -r /data/home/.claude/get-shit-done root@37.27.212.18:/data/home/.claude/get-shit-done
  scp -r /data/home/.claude/skills        root@37.27.212.18:/data/home/.claude/skills 2>/dev/null || true
  echo "GSD copied."
else
  echo "GSD already installed on VPS — skipping."
fi
```

Step 6 — Set up GSD symlinks in each project (same as Railway):
```bash
ssh root@37.27.212.18 << 'SYMEOF'
set -eux
for proj in gsddashboard debates ynab reforma; do
  dir="/data/home/$proj"
  [ -d "$dir" ] || continue
  mkdir -p "$dir/.claude"
  if [ ! -L "$dir/.claude/get-shit-done" ] && [ ! -d "$dir/.claude/get-shit-done" ]; then
    ln -s /data/home/.claude/get-shit-done "$dir/.claude/get-shit-done"
    echo "GSD symlink created for $proj"
  else
    echo "GSD symlink already exists for $proj"
  fi
done
SYMEOF
```
  </action>
  <verify>
    <automated>ssh root@37.27.212.18 "ls /data/home/gsddashboard /data/home/debates /data/home/ynab /data/home/reforma /data/home/.env /data/home/CLAUDE.md"</automated>
  </verify>
  <done>
    - `ssh root@37.27.212.18 "ls /data/home/"` shows: gsddashboard, debates, ynab, reforma, .env, CLAUDE.md
    - `ssh root@37.27.212.18 "ls /data/home/gsddashboard/.env"` — env file present
    - `ssh root@37.27.212.18 "ls /data/home/ynab/.env.local"` — env file present
    - `ssh root@37.27.212.18 "cat /root/.claude/settings.json | grep -c hook"` — returns ≥ 3 (hooks present)
    - `ssh root@37.27.212.18 "ls /data/home/.claude/get-shit-done/bin/gsd-tools.cjs"` — GSD installed
    - `ssh root@37.27.212.18 "ls /data/home/gsddashboard/.claude/get-shit-done"` — symlink exists
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix GSD Dashboard on VPS — disable proxy mode, enable auth, restart PM2</name>
  <read_first>
    - /data/home/gsddashboard/.env (current env vars on Railway — AUTH_REQUIRED and DASHBOARD_PASSWORD values)
    - /data/home/gsddashboard/.planning/phases/62-hetzner-vps-migration/62-04-SUMMARY.md (VPS PM2 setup)
  </read_first>
  <files>
    /data/home/gsddashboard/.env (on VPS — GSD_DATA_URL removed, AUTH_REQUIRED added)
  </files>
  <action>
The GSD Dashboard on VPS has two problems:
1. It shows no projects — because GSD_DATA_URL is set to a Railway/tunnel URL (proxy mode),
   so it reads data from Railway instead of local /root/.claude/projects/
2. No password prompt — AUTH_REQUIRED is not set in the VPS env

Step 1 — Read current VPS dashboard .env to understand its state:
```bash
ssh root@37.27.212.18 "cat /data/home/gsddashboard/.env 2>/dev/null || \
  find /home/services -name '.env' -path '*/gsddashboard/*' 2>/dev/null | xargs cat"
```

Step 2 — Update the dashboard .env on VPS:
The key changes:
- Remove or unset GSD_DATA_URL (disables proxy mode; dashboard reads local ~/.claude/)
- Add AUTH_REQUIRED=true and DASHBOARD_PASSWORD from Railway .env

```bash
# Read Railway values
AUTH_REQUIRED=$(grep "^AUTH_REQUIRED=" /data/home/gsddashboard/.env | cut -d= -f2-)
DASHBOARD_PASSWORD=$(grep "^DASHBOARD_PASSWORD=" /data/home/gsddashboard/.env | cut -d= -f2-)

echo "AUTH_REQUIRED=$AUTH_REQUIRED"
echo "DASHBOARD_PASSWORD=<redacted>"
```

Then update the VPS .env:
```bash
ssh root@37.27.212.18 << ENVEOF
set -eux

# Find where the .env lives (either /data/home/gsddashboard or /home/services/gsddashboard)
ENV_PATH=\$(find /home/services /data/home -name ".env" -path "*/gsddashboard/*" 2>/dev/null | head -1)
ENV_PATH=\${ENV_PATH:-/data/home/gsddashboard/.env}
echo "Updating: \$ENV_PATH"

# Remove GSD_DATA_URL (disables proxy mode)
sed -i '/^GSD_DATA_URL=/d' "\$ENV_PATH"
sed -i '/^# GSD_DATA_URL/d' "\$ENV_PATH"

# Add or update AUTH_REQUIRED
grep -q "^AUTH_REQUIRED=" "\$ENV_PATH" \
  && sed -i "s|^AUTH_REQUIRED=.*|AUTH_REQUIRED=$AUTH_REQUIRED|" "\$ENV_PATH" \
  || echo "AUTH_REQUIRED=$AUTH_REQUIRED" >> "\$ENV_PATH"

# Add or update DASHBOARD_PASSWORD
grep -q "^DASHBOARD_PASSWORD=" "\$ENV_PATH" \
  && sed -i "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD|" "\$ENV_PATH" \
  || echo "DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD" >> "\$ENV_PATH"

echo "=== Updated .env (redacted) ==="
grep -v "PASSWORD\|SECRET\|KEY\|TOKEN" "\$ENV_PATH" || true
ENVEOF
```

Step 3 — Restart PM2 gsd-dashboard to pick up new env:
```bash
ssh root@37.27.212.18 << 'RESTARTEOF'
set -eux
pm2 restart gsd-dashboard
sleep 5
pm2 show gsd-dashboard | grep -E "status|pid|uptime"
curl -s -o /dev/null -w "%{http_code}" http://localhost:4820/api/health
RESTARTEOF
```

Step 4 — Verify auth is now required:
```bash
# Should return 401 (unauthorized) when no cookie is sent
ssh root@37.27.212.18 "curl -s -o /dev/null -w '%{http_code}' http://localhost:4820/api/projects"
# Expected: 401 (not 200)
```

Step 5 — Verify proxy mode is disabled (dashboard reads local data):
```bash
ssh root@37.27.212.18 << 'PROXYEOF'
# Check pm2 environment for GSD_DATA_URL
pm2 show gsd-dashboard 2>/dev/null | grep "GSD_DATA_URL" || echo "GSD_DATA_URL not set — local mode active"
PROXYEOF
```
  </action>
  <verify>
    <automated>ssh root@37.27.212.18 "curl -s -o /dev/null -w '%{http_code}' http://localhost:4820/api/projects"</automated>
    <!-- Expected: 401 (auth required) -->
  </verify>
  <done>
    - `curl -s -o /dev/null -w "%{http_code}" http://localhost:4820/api/projects` returns 401 (not 200 or 500)
    - `curl -s -o /dev/null -w "%{http_code}" http://localhost:4820/api/health` returns 200
    - `pm2 show gsd-dashboard | grep GSD_DATA_URL` returns nothing (proxy mode disabled)
    - `pm2 show gsd-dashboard | grep status` shows "online"
    - Visiting https://dashboard.gsdlabs.dev prompts for password (AUTH gate active)
  </done>
</task>

<task type="human">
  <name>Task 4 (human): Start first Claude session on VPS; verify dashboard shows it live</name>
  <read_first>None — verification task</read_first>
  <files>No files modified</files>
  <action>
This task requires you (the user) to SSH into the VPS and start a Claude Code session.
The purpose is to confirm the hooks fire and the GSD Dashboard picks up the session.

Step 1 — SSH into VPS and start a test Claude session in a tmux window:
```bash
ssh root@37.27.212.18

# On VPS:
tmux new-session -s gsddashboard -c /data/home/gsddashboard
# Inside tmux:
export HOME=/root  # should already be correct for root
claude  # start Claude Code
# Claude will prompt for API key on first run if ANTHROPIC_API_KEY is not in environment
# Tip: the key is in /data/home/.env — source it first:
#   source /data/home/.env && claude
```

Step 2 — Verify the dashboard sees the session:
- Open https://dashboard.gsdlabs.dev in your browser
- Log in with your password
- The gsddashboard project should appear in the project list
- The session should show as active

Step 3 — If the session appears: thumbs up, plan complete.
Step 4 — If the session does NOT appear after ~30 seconds:
- Check hook data exists: `ls /root/.claude/projects/` on VPS
- Check dashboard logs: `pm2 logs gsd-dashboard --lines 20`
- Check if ANTHROPIC_API_KEY was needed and sourced correctly

Signal completion by typing a message confirming the dashboard shows the session,
or describing what you see (we'll debug from there).
  </action>
  <verify>
    <manual>User confirms dashboard.gsdlabs.dev shows a live Claude session after SSHing into VPS and starting claude in tmux</manual>
  </verify>
  <done>
    - Claude Code runs on VPS without errors (claude --version works, session starts)
    - ANTHROPIC_API_KEY resolves from /data/home/.env (no manual key entry needed after sourcing)
    - https://dashboard.gsdlabs.dev shows the gsddashboard project as active
    - Hook data appears in /root/.claude/projects/ on VPS
    - Session count > 0 in the dashboard
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| SCP from Railway → VPS | Env files transferred over SSH (encrypted); contain API keys — verify no plaintext in transit logs |
| GitHub clone (token in URL) | PAT embedded in git remote URL; stored in /data/home/*/.git/config; acceptable for single-user VPS |
| Claude Code → VPS filesystem | Reads/writes /root/.claude/; local only, no network exposure |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62-31 | Disclosure | GitHub PAT in git remote URLs | accept | Single-user VPS, root only; PAT is limited scope; same pattern as Railway machine |
| T-62-32 | Disclosure | Env files in /data/home/ (API keys) | mitigate | VPS is key-auth SSH only (Plan 01); files not world-readable; same exposure as Railway |
| T-62-33 | Spoofing | GSD Dashboard auth bypass if AUTH_REQUIRED missing | mitigate | Task 3 explicitly sets AUTH_REQUIRED=true; verified via 401 check |
</threat_model>

<verification>
1. `ssh root@37.27.212.18 "claude --version"` — exits 0
2. `ssh root@37.27.212.18 "ls /data/home/gsddashboard /data/home/debates /data/home/ynab /data/home/reforma"` — all present
3. `ssh root@37.27.212.18 "curl -s -o /dev/null -w '%{http_code}' http://localhost:4820/api/projects"` — 401
4. `ssh root@37.27.212.18 "curl -s -o /dev/null -w '%{http_code}' http://localhost:4820/api/health"` — 200
5. User confirms dashboard shows live session after starting claude in tmux on VPS
</verification>

<success_criteria>
- Claude Code installed on VPS via npm
- All active projects cloned from GitHub under /data/home/ on VPS
- All env files present on VPS (copied from Railway)
- GSD global hooks active in /root/.claude/settings.json
- GSD Dashboard on VPS: auth-gated (401 without login) + local mode (no GSD_DATA_URL)
- Dashboard shows a live Claude session after user starts one via SSH+tmux on VPS
- Railway Claude machine is now idle — work can shift to VPS
</success_criteria>

<output>
After completion, create `.planning/phases/62-hetzner-vps-migration/62-09b-SUMMARY.md`

Include:
- Claude Code version installed on VPS
- Projects cloned (list with git SHAs)
- Env files copied (list)
- GSD Dashboard auth status (401 confirmed)
- Screenshot or log snippet showing dashboard with live VPS session
- Confirmation that Railway Claude machine is now idle
</output>
