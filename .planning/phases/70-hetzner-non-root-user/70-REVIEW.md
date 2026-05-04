---
phase: 70-hetzner-non-root-user
reviewed: 2026-05-04T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - .github/workflows/deploy.yml
  - scripts/healthcheck.sh
  - scripts/named-tunnel.sh
  - server/routes/gsd.js
  - /home/services/KidAI/.github/workflows/deploy-hetzner.yml
  - /home/services/debates/.github/workflows/deploy-hetzner.yml
  - /home/services/ynab/.github/workflows/deploy-hetzner.yml
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 70: Code Review Report

**Reviewed:** 2026-05-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the four GitHub Actions deploy workflows, the two PM2-managed shell scripts, and the GSD route file as part of the non-root `claude` user migration. The username change (`claude` instead of `root`) is correctly applied in all four workflows. The main concerns are: a likely broken PM2 path in `healthcheck.sh` that silently no-ops, a bare-`fetch` inconsistency in `gsd.js` that bypasses internal auth headers on two proxy routes, a shell pipeline subtlety in `named-tunnel.sh` that can obscure cloudflared exit codes, and a health-check URL in the ynab workflow that targets a POST-only webhook endpoint.

## Critical Issues

### CR-01: Bare `fetch` in proxy paths bypasses internal auth headers

**File:** `server/routes/gsd.js:270` and `server/routes/gsd.js:504`

**Issue:** Two proxy code paths use the global `fetch()` directly instead of the project's `upstreamFetch()` wrapper. `upstreamFetch` injects the `x-gsd-internal` secret header (when `GSD_INTERNAL_SECRET` is set) that authenticates Railway→VPS requests. The `/send` and `/projects/create` routes skip this header, so in Railway proxy mode those requests arrive at the VPS without the internal secret and may be rejected or — if the VPS does not enforce the header — they silently bypass the intended auth layer.

Line 270 (`/send` proxy):
```js
// BUG: plain fetch — misses INTERNAL_HEADERS
const upstream = await fetch(
  `${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/send`,
  { ... }
);
```

Line 504 (`/projects/create` proxy):
```js
// BUG: plain fetch — misses INTERNAL_HEADERS
const upstream = await fetch(
  `${GSD_DATA_URL}/api/gsd/projects/create`,
  { ... }
);
```

**Fix:** Replace both bare `fetch(` calls with `upstreamFetch(`:
```js
// /send route (line ~270)
const upstream = await upstreamFetch(
  `${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/send`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(10000),
  }
);

// /projects/create route (line ~504)
const upstream = await upstreamFetch(
  `${GSD_DATA_URL}/api/gsd/projects/create`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(15000),
  }
);
```

## Warnings

### WR-01: Hardcoded PM2 path likely broken for non-root `claude` user

**File:** `scripts/healthcheck.sh:5`

**Issue:** `PM2="/usr/bin/pm2"` assumes a system-wide PM2 installation. PM2 installed via npm under the `claude` user (or via nvm) lives at `~/.npm-global/bin/pm2`, `~/.nvm/versions/node/.../bin/pm2`, or wherever the user's PATH resolves it — not `/usr/bin/pm2`. Every `$PM2 pid` and `$PM2 restart` call fails silently because all invocations pipe stderr to `/dev/null`. The script will loop forever logging failures but never actually restart the service.

**Fix:** Resolve PM2 from PATH at runtime instead of hardcoding:
```sh
PM2=$(command -v pm2) || { echo "pm2 not found in PATH"; exit 1; }
```
Or, if PM2 is always expected at a fixed non-system path after migration, set it explicitly to that path and verify it exists at startup.

### WR-02: `exec ... | tee` pipeline loses cloudflared exit code in named-tunnel.sh

**File:** `scripts/named-tunnel.sh:20`

**Issue:** `exec cloudflared ... 2>&1 | tee -a "$LOG_FILE"` creates a pipeline. In POSIX sh, a pipeline runs each component in a subshell; `exec` here replaces the left-side subshell process with `cloudflared`, but the tee on the right side means the shell itself continues running (it does not exit when cloudflared exits). PM2 monitors the process it spawned (the original sh), so PM2 sees the sh/tee process exit status, not cloudflared's. If cloudflared crashes with a non-zero code, PM2 may see exit 0 from tee and handle it incorrectly.

**Fix:** Separate the concerns — write to the log file directly via cloudflared's `--logfile` flag (if supported), or remove `exec` and use a subshell with `$?` propagation:
```sh
# Option A: let cloudflared write its own log
exec cloudflared --config /home/claude/.cloudflare-tunnel/config.yml \
  --logfile "$LOG_FILE" tunnel run

# Option B: tee but preserve exit code
cloudflared --config /home/claude/.cloudflare-tunnel/config.yml tunnel run 2>&1 | tee -a "$LOG_FILE"
exit "${PIPESTATUS[0]}"  # bash only; or use pipefail
```
Note: Option B requires `#!/usr/bin/env bash` and `set -o pipefail` since the script currently uses `sh`.

### WR-03: healthcheck.sh missing `set -u`; unset variable expansion silently ignored

**File:** `scripts/healthcheck.sh:1`

**Issue:** The script uses `#!/usr/bin/env sh` but has no `set -u`. If `PM2` or `URL` were ever unset, the script would silently proceed with empty expansions. More concretely: `$PM2 pid gsd-dashboard` with an empty `PM2` becomes a bare `pid gsd-dashboard` command invocation which fails silently (stderr suppressed). The script provides no early-exit safety net.

**Fix:** Add shell safety flags after the shebang:
```sh
#!/usr/bin/env sh
set -u
```
`set -e` is intentionally omitted here since the loop is designed to survive transient failures, but `set -u` should always be present to catch unbound variable bugs.

### WR-04: ynab health check targets a POST-only webhook endpoint

**File:** `/home/services/ynab/.github/workflows/deploy-hetzner.yml:35`

**Issue:** The deployment verification curl hits `http://localhost:3001/api/webhook`. Webhook endpoints conventionally reject GET requests with 405 Method Not Allowed or 404. A `curl -sf` GET to this URL will return a non-2xx status and cause the deployment to report failure even when the service is running correctly.

```yaml
curl -sf http://localhost:3001/api/webhook || exit 1
```

**Fix:** Use a dedicated health or readiness endpoint instead:
```yaml
curl -sf http://localhost:3001/api/health || curl -sf http://localhost:3001/ || exit 1
```
If the ynab service has no health endpoint, add one, or at minimum use a URL that responds 200 to GET requests.

### WR-05: All workflows pin to mutable tag `appleboy/ssh-action@v1.0.0` — supply chain risk

**File:** `.github/workflows/deploy.yml:21`, `KidAI/deploy-hetzner.yml:16`, `debates/deploy-hetzner.yml:17`, `ynab/deploy-hetzner.yml:17`

**Issue:** GitHub Actions tags are mutable references. A compromised or accidentally overwritten `v1.0.0` tag could execute arbitrary code on the VPS with the deploy SSH key. This is a standard GitHub Actions supply chain attack vector.

**Fix:** Pin to the exact commit SHA instead of the tag:
```yaml
uses: appleboy/ssh-action@7eaf76671a0d7eec5d98ee897acda4f968735a2e  # v1.0.0
```
Obtain the SHA with: `gh api repos/appleboy/ssh-action/git/refs/tags/v1.0.0`

## Info

### IN-01: `git checkout origin/master` leaves repo in detached HEAD state

**File:** `.github/workflows/deploy.yml:33`

**Issue:** `git checkout origin/master` checks out the remote-tracking branch directly, leaving the local repo in detached HEAD. Subsequent manual `git status` or `git pull` on the VPS will be confusing. This is functionally correct for deployment but could mislead operators investigating the repo state.

**Fix:** Use `git reset --hard origin/master` after fetch to keep the local branch tracking correctly:
```sh
git fetch origin master
git reset --hard origin/master
```
This also applies to the other three workflows which have the same pattern.

### IN-02: Hardcoded `/home/services/hetzner-vps` path inside workflow scripts

**File:** `/home/services/KidAI/.github/workflows/deploy-hetzner.yml:29`, `debates/deploy-hetzner.yml:30`, `ynab/deploy-hetzner.yml:30`

**Issue:** The docker compose invocation `cd /home/services/hetzner-vps` is hardcoded inside the `script:` block, inconsistent with the `SERVICE_PATH` env var pattern used for the git checkout. If the infra repo moves, all three workflows need manual updates.

**Fix:** Add a `INFRA_PATH` env var at the workflow level:
```yaml
env:
  INFRA_PATH: /home/services/hetzner-vps
```
Then reference it in the script: `cd ${{ env.INFRA_PATH }}`

### IN-03: Non-deterministic `sleep` before health checks

**File:** All four workflows (deploy.yml line 41, KidAI line 33, debates line 34, ynab line 34)

**Issue:** Fixed `sleep N` before health check curl is fragile — too short on slow startup, wastes time on fast startup. The ynab sleep (15s) and debates sleep (10s) are different for no documented reason.

**Fix:** Use a retry loop instead:
```sh
for i in $(seq 1 12); do
  curl -sf http://localhost:PORT/api/health && break
  [ "$i" -eq 12 ] && exit 1
  sleep 5
done
```
This retries for up to 60 seconds with 5-second intervals and fails fast once ready.

### IN-04: `named-tunnel.sh` has no validation that `cloudflared` is in PATH

**File:** `scripts/named-tunnel.sh:20`

**Issue:** If `cloudflared` is not installed or not in PATH, `exec cloudflared ...` will fail with "command not found". The error goes to the log file but PM2 will see an immediate exit and start a fast restart loop. No preflight check warns the operator.

**Fix:** Add a preflight check before `exec`:
```sh
if ! command -v cloudflared > /dev/null 2>&1; then
  log "ERROR: cloudflared not found in PATH. Cannot start tunnel."
  exit 1
fi
exec cloudflared --config /home/claude/.cloudflare-tunnel/config.yml tunnel run 2>&1 | tee -a "$LOG_FILE"
```

---

_Reviewed: 2026-05-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
