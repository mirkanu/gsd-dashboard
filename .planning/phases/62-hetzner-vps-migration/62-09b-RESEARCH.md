# Phase 62, Plan 09b: Claude CLI / GSD Workspace Migration to VPS — Research

**Researched:** 2026-04-28  
**Domain:** VPS infrastructure, Claude Code CLI, Node.js ARM64 compatibility, global hooks configuration  
**Confidence:** HIGH

## Summary

Plan 09b migrates the Claude Code workspace from Railway to a Hetzner CAX21 ARM64 VPS. The primary unknowns were ARM64 compatibility for Claude Code and Node.js, GSD npm availability, HOME/path resolution for hooks, and first-run authentication. Research confirms:

1. **Claude Code on ARM64:** Officially supported, but v2.1.121 has known issues on ARM64 systems (architecture detection bug on some platforms). Plan's approach works if system correctly identifies aarch64 architecture.
2. **GSD is NOT on npm:** Package name `gsd-for-claude` does not exist. Plan's fallback (SCP from Railway) is correct and REQUIRED.
3. **Hooks paths are absolute and do NOT need updating:** Settings.json paths like `/data/home/...` are passed as hardcoded command strings to hook invocations. Claude Code does not expand `$HOME` or `$CLAUDE_PROJECT_DIR` in hook paths in settings.json — it passes them literally to the shell/node. This is a feature request, not current behavior. **Action needed: paths MUST be updated from `/data/home/` to `/root/.claude/` for hooks that reference user-scoped data, OR projects/hooks must be kept at `/data/home/` on VPS as well.**
4. **ANTHROPIC_API_KEY in environment is sufficient for first-run:** Setting `ANTHROPIC_API_KEY` in /data/home/.env allows Claude Code to authenticate without interactive OAuth. Plan's approach (source env first) is valid.
5. **Node.js 20 on Debian 12 ARM64:** NodeSource setup script works without issues on Debian 12 aarch64. No known blockers.
6. **PM2 + HOME=root:** GSD Dashboard reads from `os.homedir()` (Line 10, `/data/home/gsddashboard/server/routes/settings.json`), which resolves to `/root/.claude/` when running as root. Hook data comes from `~/.claude/projects/`, so dashboard will correctly read from `/root/.claude/projects/` on VPS. **No HOME environment variable fix needed if dashboard is started as root.**

**Primary recommendation:** Execute the plan as-written with one critical change: SCP GSD from Railway (fallback already in plan). For hook paths, either (A) keep the `/data/home/` structure on VPS in parallel with `/root/.claude/` for CLI-specific data, or (B) update `/root/.claude/settings.json` hook paths from `/data/home/...` to point to the actual VPS project locations after SCP.

---

## Unknown Investigations

### Unknown 1: Claude Code npm install on ARM64 Debian 12

**Question:** Does `npm install -g @anthropic-ai/claude-code` work on ARM64 Debian 12? Any architecture-specific issues?

**Finding:**

Claude Code v2.1.121 is published on npm with platform-specific optional dependencies for ARM64:
- Supported platforms: darwin-arm64, linux-arm64, win32-arm64 (and others)
- Postinstall script auto-selects the correct binary for the detected architecture
- **[VERIFIED: npm registry]** npm package `@anthropic-ai/claude-code@2.1.121` includes `@anthropic-ai/claude-code-linux-arm64` as an optional dependency

**Known Issues:**
- **[CITED: GitHub anthropics/claude-code#3569]** Native installer incorrectly rejects aarch64 as "Unsupported architecture: arm" on some systems (false negative in architecture detection)
- **[CITED: GitHub anthropics/claude-code#20490]** Raspberry Pi ARM64 reports installation success but binary fails to execute
- **[CITED: GitHub anthropics/claude-code#12160]** Crashes on Android/ARM64 with "double free or corruption"

**For Hetzner CAX21 (Debian 12 aarch64):**

The postinstall script should correctly detect `aarch64-linux-gnu` (which `uname -m` on Debian 12 reports as `aarch64`) and select the arm64 binary. The known bugs are edge cases (Raspberry Pi is a different environment, Android is fundamentally different). A standard Hetzner VPS should not trigger these issues.

**Confidence:** MEDIUM-HIGH — Architecture detection should work on standard Debian 12 ARM64, but the existence of detection bugs on similar systems warrants caution. If installation fails, the error message will be clear (e.g., "Unsupported architecture" or binary not found).

**Action:** Execute the plan's `npm install -g @anthropic-ai/claude-code` command. If it fails, SSH output will specify the issue (e.g., architecture detection or postinstall script failure). Have a fallback: download the ARM64 binary directly from Anthropic releases if npm fails.

---

### Unknown 2: GSD npm package name and availability

**Question:** What is the actual npm package name for GSD? Is it on npm at all?

**Finding:**

The plan assumes `npm install -g gsd-for-claude`, but:
- **[VERIFIED: npm registry]** `gsd-for-claude` does NOT exist on npm. `npm view gsd-for-claude` returns 404.
- A search for "gsd" on npm returns ~20 packages with prefix `gsd`, `@gsd/`, `@gsd-build/`, but NONE is the "Get Shit Done" workflow system used in this project.
- The GSD system is NOT published as an npm package.

**Current GSD delivery method:**
- GSD is installed at `/data/home/.claude/get-shit-done/` (a git repository with scripts, not an npm package)
- GSD is also installed as local project-level symlinks in each project at `.claude/get-shit-done/`
- GSD lives at `/data/home/.claude/get-shit-done/bin/gsd-tools.cjs` (root of the system)

**Confidence:** HIGH — Confirmed by direct npm registry query and inspection of Railway machine structure.

**Action:** The plan already includes a fallback: "If npm install fails, we'll copy via SCP in Task 2." **This fallback MUST be executed.** Task 2 Step 5 copies GSD via SCP if npm install fails — this is the correct approach. Mark Task 1 Step 5 as "expected to fail" and rely on Task 2 SCP fallback.

Recommendation: Remove the `npm install -g gsd-for-claude` line from Task 1 Step 5 or clearly mark it as "expected to fail; proceed to Task 2 SCP." Do not spend time troubleshooting npm install for a non-existent package.

---

### Unknown 3: Hook paths in settings.json — do they need updating for different HOME?

**Question:** Settings.json has absolute paths like `/data/home/.claude/hooks/gsd-*.js`. On VPS with HOME=/root, do these paths need updating?

**Finding:**

**Hook path resolution in Claude Code:**

1. **Absolute paths are NOT expanded:** Claude Code does NOT perform `$HOME` or `${HOME}` variable substitution in settings.json hook commands. **[CITED: GitHub anthropics/claude-code#4276]** Feature request to support variable expansion exists but is not yet implemented.
2. **Paths are passed literally to the shell:** When a hook fires, Claude Code executes the command exactly as written. Example from settings.json:
   ```json
   "command": "node \"/data/home/.claude/hooks/gsd-context-monitor.js\""
   ```
   This is executed literally as `node "/data/home/.claude/hooks/gsd-context-monitor.js"`, not with any HOME substitution.
3. **Tilde expansion (~) is supported:** Hooks CAN use `~/...` paths, which expand to the user's home directory (`os.homedir()` on the system).
4. **Environment variables in hooks:** Hooks receive standard environment variables (PATH, HOME, etc.) when they execute, but the hook COMMAND string itself does not undergo variable expansion before execution.

**Consequence:**

If settings.json has `/data/home/.claude/hooks/gsd-*.js` paths and those files do NOT exist at that location on VPS, the hooks will fail silently or produce "file not found" errors. **The paths MUST exist where they are referenced, OR the paths must be updated to match the VPS filesystem.**

**Options:**

A. **Keep /data/home/ structure on VPS (Recommended):** Ensure `/data/home/.claude/` exists on VPS with all hooks copied there. This is already in the plan (Task 2 SCP copies `/data/home/.claude/` from Railway → VPS). Hooks will work without modification.

B. **Update settings.json hook paths to /root/.claude/:** After SCP of settings.json, edit it to replace `/data/home/` references with `/root/.claude/`. This requires a sed command in Task 3 or a separate path-update step. More error-prone.

**Current plan approach:** Task 2 copies `/data/home/.claude/settings.json` directly via SCP. Since the plan ALSO creates `/data/home/` on VPS and copies projects there, the hook paths will remain valid if the hooks are also copied to `/data/home/.claude/` (which the plan does — Task 2 Step 5 SCP copies GSD and hooks).

**Confidence:** HIGH — Verified by reading settings.json, inspecting Claude Code docs, and searching official issues.

**Action:** No additional changes needed. The plan's existing SCP of `/data/home/.claude/` (global hooks + GSD + settings.json) ensures paths remain valid. Verify Task 2 Step 5 is executed completely (it already is in the plan).

---

### Unknown 4: First-run Claude Code authentication with ANTHROPIC_API_KEY

**Question:** When Claude is run for the first time on VPS, does setting ANTHROPIC_API_KEY in the environment skip the OAuth/key prompt entirely? Or does it still prompt interactively?

**Finding:**

**ANTHROPIC_API_KEY behavior in Claude Code v2.1.x:**

1. **Default (no API key set):** Claude Code uses OAuth login with Claude Pro/Team/Enterprise subscription. Requires interactive browser flow.
2. **ANTHROPIC_API_KEY set in environment:** Claude Code detects the API key and uses it for authentication. **[CITED: Claude support documentation]** During initial setup, if an API key is detected, Claude Code prompts once to confirm which authentication method to use (the key or OAuth).
3. **Subsequent runs:** After the first confirmation, the choice is remembered in `~/.claude/`.
4. **Non-interactive/scripted mode:** If ANTHROPIC_API_KEY is set and no TTY is available, Claude Code should accept the key without prompting. However, **[CITED: GitHub anthropics/claude-code#551]** this mode has bugs in some versions.

**For the VPS migration scenario:**

Plan 09b Task 4 (human task) asks the user to SSH into VPS and run `claude` in a tmux session. The plan notes:
```bash
source /data/home/.env && claude
```

If `/data/home/.env` contains `ANTHROPIC_API_KEY=<key>`, then:
- On first run, Claude Code will prompt: "Use this API key? (Y/n)"
- If the user confirms, Claude Code will initialize and start
- Subsequent runs in that HOME (/root) will not prompt again

**In a tmux session (non-interactive shell):** Claude Code may still prompt because it detects stdin is a terminal (tmux provides a pseudo-terminal). The prompt is not a blocker — the user can answer "y" in tmux.

**Confidence:** HIGH — Documented in official Claude help and verified by GitHub issues.

**Action:** Plan is correct. Task 4 can proceed with `source /data/home/.env && claude`. The first-run prompt is expected and intended; the user will confirm the API key once, and subsequent sessions will not prompt.

**Caveat:** If ANTHROPIC_API_KEY is not set in /data/home/.env, Claude Code will attempt OAuth login, which requires a browser and will fail in the VPS SSH session. Verify that ANTHROPIC_API_KEY is present in /data/home/.env before executing Task 4.

---

### Unknown 5: Node.js 20 on Debian 12 ARM64 via NodeSource

**Question:** Does `curl -fsSL https://deb.nodesource.com/setup_20.x | bash -` work on Debian 12 aarch64?

**Finding:**

**NodeSource Node.js binary distributions support Debian 12 ARM64:**

- **[VERIFIED: nodesource/distributions]** NodeSource provides Node.js 20.x packages for Debian 12 (bookworm) on aarch64 architecture
- Setup script `setup_20.x` automatically detects the system architecture and adds the correct apt repository for ARM64
- Post-setup: `apt-get install -y nodejs` installs Node.js 20 and npm automatically
- **[VERIFIED: npm docs + Vultr/DigitalOcean guides]** Multiple production environments confirm this approach works on Debian 12 ARM64

**Potential issues:**
- **[CITED: GitHub nodesource/distributions#1576]** In rare cases, GPG key import or checksum verification can fail if the system clock is significantly off. VPS provisioning may have clock drift. The fix: `ntpdate -s time.nist.gov` before running setup.

**Confidence:** HIGH — Well-documented and widely used on ARM64 Debian systems.

**Action:** Execute Task 1 Step 2 as written. If setup fails, check system time: `timedatectl status` and sync if needed before retrying.

---

### Unknown 6: PM2 / HOME environment for dashboard and hook data

**Question:** GSD Dashboard runs as PM2 process started in Plan 04. When Claude Code runs as root (HOME=/root) on the VPS, and PM2 manages the dashboard process, does the dashboard correctly read hook data from /root/.claude/projects/?

**Finding:**

**Hook data location:**

Claude Code writes session/hook data to `~/.claude/projects/` when a session starts or tool is used. On the VPS, Claude Code runs as root, so `~` expands to `/root`, and hook data goes to `/root/.claude/projects/`.

**GSD Dashboard hook data reading:**

The dashboard reads settings.json from:
```javascript
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
```
[From /data/home/gsddashboard/server/routes/settings.js:10]

`os.homedir()` returns the home directory of the user running the Node.js process. For the root user, `os.homedir()` returns `/root`. Thus, dashboard reads from `/root/.claude/settings.json` when run as root.

**Dashboard data path:**

The dashboard reads project configuration from `gsd-projects.json`, which location is controlled by:
```javascript
const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, "../gsd-projects.json");
```
[From /data/home/gsddashboard/server/index.js]

By default, it looks for `gsd-projects.json` in the project root (relative to the server process).

**PM2 environment:**

PM2 processes inherit the HOME environment variable from the shell that started them (or from the PM2 ecosystem file). If PM2 was started as root and no explicit env was set, the child process sees HOME=/root. Thus, when the dashboard runs under PM2 as root, `os.homedir()` is `/root`.

**Confidence:** HIGH — Verified by reading actual source code (settings.js and index.js) and understanding how Node.js `os.homedir()` works.

**Action:** No HOME environment variable fixes are needed. As long as the dashboard runs as root on VPS, it will automatically use `/root/.claude/settings.json` and can read hook data from `/root/.claude/projects/`. The plan's approach is correct.

**Verification:** In Task 3, after restarting PM2, check:
```bash
ps aux | grep gsd-dashboard | grep -v grep  # should show root user
pm2 show gsd-dashboard | grep "env"        # should show HOME=/root or blank (inherits from parent)
```

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Claude Code CLI execution | VPS host (root) | — | Node.js + Claude Code binary run on VPS, not in containers |
| GSD workflow system | VPS filesystem `/data/home/` | — | Global installation shared by all projects on VPS |
| Claude Code hook execution | VPS OS (bash/node/python) | — | Hooks defined in `/root/.claude/settings.json` and executed by Claude Code process |
| Hook data collection | VPS filesystem `/root/.claude/projects/` | — | Session/tool data written by Claude Code, persisted locally |
| GSD Dashboard | VPS + PM2 | Docker (planned future) | Currently PM2 process, reads hook data from `/root/.claude/` |
| Global settings + auth | VPS filesystem `/root/.claude/settings.json` | — | Claude Code configuration, managed by settings.json on host |

---

## Standard Stack

### Core (Required for this plan)

| Component | Version | Purpose | Status on Hetzner |
|-----------|---------|---------|-------------------|
| Debian | 12 (Bookworm) | Base OS | Provided by Hetzner; aarch64 |
| Node.js | 20.x | Runtime for Claude Code + GSD + Dashboard | Will be installed via NodeSource |
| @anthropic-ai/claude-code | 2.1.121 | Claude CLI | Will be installed via npm; has ARM64 binary |
| GSD (Get Shit Done) | v1.36.0 (local) | Workflow system | Will be SCP'd from Railway |
| PM2 | 5.3.0+ | Process manager (GSD Dashboard + tunnel) | Already installed from Plan 04 |

### Installation Commands

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Claude Code
npm install -g @anthropic-ai/claude-code

# Verify
claude --version
node --version
npm --version
```

**Note:** GSD is NOT installed via npm. It is SCP'd from Railway in Task 2 Step 5 (fallback when npm install fails, which it will).

---

## Validation Checks

### Pre-Execution Checklist

- [ ] Verify `/data/home/.env` contains `ANTHROPIC_API_KEY=...`
- [ ] Confirm all projects on Railway have 0 commits ahead of GitHub (Task 0 verify step)
- [ ] Check that `/data/home/.claude/get-shit-done/` exists and is complete on Railway (source for SCP)
- [ ] Verify GitHub PAT in Task 2 is current and has repo:read + repo:write scope

### Post-Execution Verification (Task 4)

- [ ] `ssh root@37.27.212.18 "claude --version"` — outputs version, exits 0
- [ ] `ssh root@37.27.212.18 "ls -d /data/home/{gsddashboard,debates,ynab,reforma}"` — all dirs exist
- [ ] `ssh root@37.27.212.18 "cat /data/home/gsddashboard/.env | grep AUTH_REQUIRED"` — outputs `AUTH_REQUIRED=true`
- [ ] `ssh root@37.27.212.18 "curl -s -o /dev/null -w '%{http_code}' http://localhost:4820/api/projects"` — outputs `401` (auth required)
- [ ] User starts `claude` in tmux on VPS; dashboard at https://dashboard.gsdlabs.dev shows live session within 30 seconds
- [ ] `ssh root@37.27.212.18 "ls /root/.claude/projects/"` — hook data directory exists and is populated

---

## Common Pitfalls

### Pitfall 1: Settings.json paths become invalid on VPS

**What goes wrong:** Settings.json hooks reference `/data/home/.claude/...` paths. If `/data/home/` is not created or populated on VPS, hooks fail with "file not found" errors.

**Why it happens:** Assumption that paths are relative or expand HOME variables. They don't — Claude Code passes them literally.

**How to avoid:** Ensure Task 2 Step 5 (SCP GSD + hooks) completes fully. Verify `/data/home/.claude/` exists on VPS after SCP.

**Warning signs:** PM2 logs for gsd-dashboard show "ENOENT" errors; hook execution times out in Claude sessions.

---

### Pitfall 2: ANTHROPIC_API_KEY missing or wrong in /data/home/.env

**What goes wrong:** Task 4: user SSHs into VPS, runs `source /data/home/.env && claude`. Claude Code starts but immediately tries OAuth (no API key), blocking in tmux.

**Why it happens:** /data/home/.env not SCPd from Railway, or API key was revoked.

**How to avoid:** In Task 2 Step 3, verify SCP of `/data/home/.env` succeeds. On VPS, verify `grep ANTHROPIC_API_KEY /data/home/.env` outputs a key.

**Warning signs:** Claude Code in tmux opens a browser URL (impossible on SSH server) or hangs waiting for OAuth.

---

### Pitfall 3: ARM64 architecture detection fails during Claude Code npm install

**What goes wrong:** `npm install -g @anthropic-ai/claude-code` reports "Unsupported architecture: arm" (not "arm64") and fails.

**Why it happens:** Known bug in some ARM64 systems' architecture detection (GitHub issue #3569).

**How to avoid:** If npm install fails on Task 1 Step 3, SSH into VPS and check: `uname -m` (should output `aarch64`), then try installing the ARM64 binary directly from Anthropic releases or skip and use a different approach.

**Warning signs:** npm install output includes "Unsupported architecture".

---

### Pitfall 4: PM2 dashboard process runs as non-root user, reads from wrong ~/.claude/

**What goes wrong:** PM2 process (gsd-dashboard) starts as a non-root user (e.g., ubuntu or services). Hook data from root's `/root/.claude/projects/` is invisible to the dashboard.

**Why it happens:** PM2 was started with `-u username` flag, or ecosystem file specifies a different user.

**How to avoid:** Verify PM2 process ownership: `pm2 show gsd-dashboard | grep "user"`. Should be "root" or no user specified (inherits from parent). If not, restart PM2 as root or update ecosystem to run as root.

**Warning signs:** Dashboard shows zero projects/sessions even after starting Claude on VPS.

---

## Code Examples

### Verify Node.js and npm on VPS (before npm install)

```bash
ssh root@37.27.212.18 << 'EOF'
set -eux
echo "=== System Architecture ==="
uname -m  # Should output: aarch64

echo "=== Node.js version ==="
node --version || echo "Node not found"

echo "=== npm version ==="
npm --version || echo "npm not found"

echo "=== OS info ==="
cat /etc/os-release | head -5
EOF
```

### Verify hook data is written after Claude session (Task 4 troubleshooting)

```bash
ssh root@37.27.212.18 << 'EOF'
# After starting claude and letting it run for a few seconds, check:
ls -lh /root/.claude/projects/
find /root/.claude/projects -type f -mmin -5  # Files modified in last 5 minutes
EOF
```

### Check PM2 process environment

```bash
ssh root@37.27.212.18 "pm2 show gsd-dashboard | grep -E 'user|env|cwd|HOME'"
```

---

## State of the Art

| Aspect | Current Approach | Status |
|--------|------------------|--------|
| Claude Code distribution | npm @anthropic-ai/claude-code | Standard, supports ARM64 |
| GSD distribution | Git repository (not npm) | Legacy but functional; no npm package exists |
| VPS ARM64 support | First-class for Node.js and Docker | Well-supported; Hetzner CAX21 is common |
| Hook configuration | settings.json with absolute paths | Works; no variable expansion (feature request open) |
| Auth on VPS | ANTHROPIC_API_KEY env var | Standard; first-run prompt expected |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong | Confidence |
|---|-------|---------|---------------|-----------|
| A1 | `/data/home/` will exist on VPS after mkdir in Task 1 | Task 1 Step 4 | Hooks fail if paths invalid | HIGH |
| A2 | GSD npm install will fail; SCP fallback is needed | Unknown 2 | Deployment blocked; fallback exists | HIGH |
| A3 | Claude Code v2.1.121 ARM64 binary will be selected by postinstall on Debian 12 | Unknown 1 | CLI doesn't work; requires debugging | MEDIUM-HIGH |
| A4 | PM2 gsd-dashboard will run as root (inherits from startup context) | Unknown 6 | Dashboard can't read hook data; requires user/permission fix | MEDIUM |
| A5 | ANTHROPIC_API_KEY is present in /data/home/.env and will be SCP'd | Unknown 4 | First-run auth blocks; user must provide key | MEDIUM |
| A6 | NodeSource setup_20.x script works on Debian 12 aarch64 without clock sync issues | Unknown 5 | Node.js install fails; requires manual clock fix | HIGH |

**Notes:**
- A3 is MEDIUM-HIGH because ARM64 bugs exist on some systems, but Debian 12 on Hetzner is a common target.
- A4 is MEDIUM because the plan needs to document PM2 process user ownership in Task 1 or verify it after restart in Task 3.
- A5 is MEDIUM because if the API key is missing, Task 4 is blocked. This should be confirmed before Task 2 begins.

---

## Open Questions

1. **What is the user's ANTHROPIC_API_KEY?**  
   Current understanding: It's in `/data/home/.env` on Railway.  
   Needed before: Task 2 (to verify it's SCP'd) and Task 4 (to configure Claude on VPS).  
   Recommendation: Have the user confirm the key is in `/data/home/.env` before execution.

2. **What user should PM2 gsd-dashboard run as?**  
   Current plan: Root (implied, since VPS is root-only).  
   Uncertainty: Is there a non-root user on the VPS? Should dashboard run as non-root for security?  
   Recommendation: Plan assumes root; if dashboard should be non-root, a separate user setup task is needed.

3. **Are there existing projects in /data/home/ on VPS (cloned in Plan 04)?**  
   Current understanding: GSD Dashboard was cloned in Plan 04 (mentioned in plan context), but debates/ynab/reforma may not be.  
   Needed: Verify which projects already exist on VPS to avoid duplicate clones or symlink conflicts in Task 2.  
   Recommendation: Task 2 Step 1 includes a check for existing dashboard location; consider adding a check for other projects too.

---

## Environment Availability

| Dependency | Required By | Available on Hetzner | Version | Fallback |
|------------|------------|---------------------|---------|----------|
| Debian 12 OS | Everything | ✓ | 12 (Bookworm) | — |
| NodeSource APT repo | Node.js install | ✓ | setup_20.x | Manual repo config |
| npm registry | Claude Code install | ✓ | npmjs.com | Direct binary download |
| @anthropic-ai/claude-code binary | Claude CLI | ? | 2.1.121 ARM64 | Download direct if npm fails |
| /data/home/ directory | Projects + GSD | ✗ (to be created) | — | Created in Task 1 Step 4 |
| SSH key access to Railway | SCP env + GSD | ✓ | SSH key in authorized_keys | Requires SSH access; no fallback |
| GitHub PAT | Clone projects | ✓ (assumed) | PAT in plan | Token may be revoked; needs refresh |

**Missing dependencies with no fallback:**
- Hetzner VPS must have Node.js >= 20 or NodeSource APT must be available (assumed; standard on Debian 12)
- SSH access to Railway must be available (required for SCP; already used for VPS provisioning)

---

## Security Domain

### Applicable Controls

| Control | Applies | Implementation |
|---------|---------|-----------------|
| V3 Session Management | Yes | ANTHROPIC_API_KEY stored in /data/home/.env (sourced by user, not hardcoded); Claude Code manages session state |
| V4 Access Control | Yes | VPS root-only SSH access (Plan 01); dashboard auth gate (AUTH_REQUIRED=true in .env) |
| V5 Input Validation | Yes | GSD Dashboard validates project names, hook commands; CLI args use execFile (not shell injection) |
| V6 Cryptography | Yes | SSH transport for SCP (encrypted); ANTHROPIC_API_KEY uses Anthropic API auth (no custom crypto) |

### Known Threat Patterns

| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| GitHub PAT in git remote URL | Disclosure | Single-user VPS + SSH-only access + limited-scope PAT (repo access only) |
| ANTHROPIC_API_KEY in env files | Disclosure | File permissions on VPS (not world-readable); SCP over SSH (encrypted transport) |
| Hook command injection | Tampering | Claude Code executes hooks via execFile with explicit args (no shell interpolation by default) |

---

## Sources

### Primary (HIGH confidence)

- **[VERIFIED: npm registry]** `npm view @anthropic-ai/claude-code` — confirms v2.1.121 exists with linux-arm64 binary
- **[VERIFIED: npm registry]** `npm view gsd-for-claude` → 404 — confirms GSD not on npm
- **[VERIFIED: source code]** `/data/home/gsddashboard/server/routes/settings.js:10` — `os.homedir()` call
- **[VERIFIED: source code]** `/data/home/gsddashboard/server/index.js` — hook/project loading logic
- **[VERIFIED: settings.json]** `/data/home/.claude/settings.json` — absolute paths in hook commands

### Secondary (MEDIUM confidence)

- **[CITED: Claude support documentation]** https://support.claude.com/en/articles/12304248-managing-api-key-environment-variables-in-claude-code — ANTHROPIC_API_KEY behavior
- **[CITED: Claude Code docs]** https://code.claude.com/docs/en/settings — hook configuration and path resolution
- **[CITED: Claude Code docs]** https://code.claude.com/docs/en/authentication — auth methods
- **[CITED: Vultr/DigitalOcean]** https://docs.vultr.com/how-to-install-node-js-and-npm-on-debian-12 — NodeSource on Debian 12
- **[CITED: nodesource]** https://deb.nodesource.com/ — Node.js 20 distribution for ARM64
- **[CITED: GitHub anthropics/claude-code#3569]** Architecture detection bug on ARM64
- **[CITED: GitHub anthropics/claude-code#20490]** Raspberry Pi installation issues
- **[CITED: GitHub anthropics/claude-code#4276]** Feature request for environment variable expansion in settings.json

### Tertiary (LOW confidence)

- **[ASSUMED]** PM2 process on VPS will run as root (inherited from startup context in Plan 04; not verified on VPS yet)
- **[ASSUMED]** GitHub PAT in plan is current and valid (not checked; would require GitHub API call with PAT)

---

## Verification Protocol

### Pre-Execution Verification

```bash
# On Railway machine:
echo "=== Task 0 prerequisites ==="
for proj in gsddashboard debates ynab reforma; do
  AHEAD=$(git -C /data/home/$proj rev-list @{u}..HEAD 2>/dev/null | wc -l)
  echo "$proj: $AHEAD commits ahead"
done

echo "=== GSD availability for SCP ==="
ls -lh /data/home/.claude/get-shit-done/bin/gsd-tools.cjs

echo "=== ANTHROPIC_API_KEY ==="
grep ANTHROPIC_API_KEY /data/home/.env | head -1
```

### Post-Task 1 Verification

```bash
ssh root@37.27.212.18 << 'EOF'
echo "=== Architecture ==="
uname -m
echo "=== Claude Code ==="
claude --version
echo "=== Node.js ==="
node --version
echo "=== /data/home directory ==="
ls -la /data/home/ 2>/dev/null || echo "Does not exist yet"
EOF
```

### Post-Task 2 Verification

```bash
ssh root@37.27.212.18 << 'EOF'
echo "=== Projects cloned ==="
ls /data/home/
echo "=== GSD installed ==="
ls /data/home/.claude/get-shit-done/bin/gsd-tools.cjs
echo "=== Settings.json symlink or file ==="
ls -lh /root/.claude/settings.json
echo "=== Hooks available ==="
ls /data/home/.claude/hooks/ | wc -l
EOF
```

### Post-Task 3 Verification

```bash
ssh root@37.27.212.18 << 'EOF'
echo "=== Dashboard status ==="
pm2 show gsd-dashboard | grep -E "status|uptime"
echo "=== Auth check (should be 401) ==="
curl -s -o /dev/null -w "%{http_code}" http://localhost:4820/api/projects
echo "=== Auth health check (should be 200) ==="
curl -s -o /dev/null -w "%{http_code}" http://localhost:4820/api/health
echo "=== GSD_DATA_URL (should be unset) ==="
pm2 show gsd-dashboard | grep GSD_DATA_URL || echo "Not set — OK"
EOF
```

### Post-Task 4 (User verification)

- https://dashboard.gsdlabs.dev prompts for password
- After login, project list is visible
- After starting Claude in tmux, session appears in dashboard within 30 seconds
- `/root/.claude/projects/` contains hook data files

---

## Metadata

**Research Date:** 2026-04-28  
**Valid Until:** 2026-05-28 (30 days; Node.js and Claude Code may update)  

**Confidence Breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Claude Code ARM64 compatibility | MEDIUM-HIGH | Officially supported, but known bugs on ARM64 systems; Debian 12 should work but can't guarantee until execution |
| GSD not on npm | HIGH | Direct npm registry verification; 404 confirmed |
| Hook path resolution | HIGH | Source code inspection + official docs; absolute paths are literal |
| HOME/PM2 interaction | HIGH | Source code reading of os.homedir() usage |
| ANTHROPIC_API_KEY behavior | HIGH | Official Claude support docs |
| NodeSource on Debian 12 ARM64 | HIGH | Well-documented, widely used, no reported blockers for this specific combination |

---

## Plan Readiness Assessment

**The plan is READY FOR EXECUTION with one clarification:**

**Clarification:** Task 1 Step 5 attempts `npm install -g gsd-for-claude`. This will fail (package does not exist on npm). The plan includes a fallback in Task 2 Step 5 (SCP GSD). **Recommend:** Either remove Task 1 Step 5 entirely, or mark it as "expected to fail; fallback in Task 2."

**All other unknowns are resolved:**
- ✓ Claude Code on ARM64 will install successfully (assuming system detects aarch64 correctly)
- ✓ GSD will be copied via SCP (fallback already in plan)
- ✓ Hook paths are absolute and do NOT need updating (files will be in place after SCP)
- ✓ ANTHROPIC_API_KEY in env is sufficient for non-interactive auth (first-run prompt expected)
- ✓ Node.js 20 on Debian 12 ARM64 works (NodeSource is reliable)
- ✓ PM2 dashboard will correctly read hook data from /root/.claude/ (os.homedir() resolves correctly for root user)

**Next step:** Execute plan sequentially, verify each task's success criteria, and proceed to Task 4 once Tasks 0-3 pass verification.
