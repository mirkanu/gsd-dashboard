---
phase: quick-43
plan: 43
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/tunnel.sh
  - scripts/tunnel-setup.sh
  - .env
  - README.md
  - ecosystem.config.cjs
autonomous: false
requirements:
  - QUICK-43-TUNNEL-SWAP
  - QUICK-43-ZOMBIE-CLEANUP
must_haves:
  truths:
    - "Public tunnel URL responds 200 (not 403 ERR_NGROK_725) to /api/health"
    - "Terminal WebSocket on live Railway URL connects and streams pty output"
    - "gsd-tunnel PM2 app is online and running Tailscale Funnel (not ngrok)"
    - "Zombie node --test and stale tmux send-keys/attach processes older than 24h are gone"
    - "Live gsd-dashboard PM2 app and active KidAI tmux session remain untouched"
    - "Railway GSD_DATA_URL env var points at the new Tailscale Funnel URL"
  artifacts:
    - path: "scripts/tunnel.sh"
      provides: "Tailscale Funnel launcher loop (replaces ngrok)"
      contains: "tailscale funnel"
    - path: ".env"
      provides: "TAILSCALE_FUNNEL_URL variable; NGROK_DOMAIN removed"
      contains: "TAILSCALE_FUNNEL_URL"
    - path: "README.md"
      provides: "Updated Remote Access section documenting Tailscale Funnel"
      contains: "Tailscale Funnel"
    - path: "ecosystem.config.cjs"
      provides: "gsd-tunnel PM2 entry still points at scripts/tunnel.sh"
      contains: "gsd-tunnel"
  key_links:
    - from: "scripts/tunnel.sh"
      to: "localhost:4820"
      via: "tailscale funnel --bg"
      pattern: "tailscale funnel"
    - from: "Railway gsd-dashboard (GSD_DATA_URL)"
      to: "Tailscale Funnel URL"
      via: "HTTPS proxy in server/routes/gsd.js"
      pattern: "GSD_DATA_URL"
    - from: "Browser terminal client"
      to: "Tailscale Funnel URL (wss://)"
      via: "/api/gsd/ws-base response → wsBase"
      pattern: "wss://"
---

<objective>
Switch the public tunnel for the GSD Dashboard from ngrok (free tier bandwidth exhausted — ERR_NGROK_725 on every request) to Tailscale Funnel, and clean up zombie node test and tmux processes left behind by prior test runs.

Purpose: Ngrok's bandwidth limit is returning 403 on every HTTP/WS request, breaking the terminal WebSocket path (Railway → ngrok → local 4820). Tailscale Funnel has no bandwidth caps for personal use and gives a stable `*.ts.net` URL. Zombie cleanup removes long-dead `node --test server/__tests__` runners and stale `tmux send-keys/attach-session` handles without touching the live `gsd-dashboard` PM2 app or the active KidAI tmux session.

Output:
- Tailscale installed and authenticated, Funnel enabled, public URL serving 200 on `/api/health`
- `scripts/tunnel.sh` rewritten to loop `tailscale funnel --bg 4820`
- `.env` cleaned (`NGROK_DOMAIN` removed, `TAILSCALE_FUNNEL_URL` added)
- `scripts/tunnel-setup.sh` updated to print the Tailscale setup flow
- `README.md` remote-access section corrected (was wrong — said cloudflared)
- Railway `GSD_DATA_URL` updated + redeployed
- Zombie processes killed by specific PID/pattern
- Live terminal on Railway verified by user
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@/data/home/CLAUDE.md

<interfaces>
<!-- Current ngrok wrapper (scripts/tunnel.sh) — will be fully replaced -->
```sh
#!/usr/bin/env sh
# Loops: ngrok http $DASHBOARD_PORT --domain=$NGROK_DOMAIN
# Loaded env: NGROK_DOMAIN, DASHBOARD_PORT=4820
# Logs to: /data/home/gsddashboard/logs/gsd-tunnel.log
```

<!-- PM2 entry (ecosystem.config.cjs) — keep as-is, just changes body of tunnel.sh -->
```js
{
  name: 'gsd-tunnel',
  script: 'scripts/tunnel.sh',
  cwd: '/data/home/gsddashboard',
  interpreter: '/bin/sh',
  restart_delay: 5000,
  max_restarts: 50,
  autorestart: true,
}
```

<!-- Server endpoint consumed by browser (server/routes/gsd.js ~line 38) -->
```js
// GET /api/gsd/ws-base
// Returns { wsBase: wss://<GSD_DATA_URL host> } when GSD_DATA_URL set
// Browser terminal opens WS to this base — MUST be the new Tailscale Funnel URL
```

<!-- Current .env (relevant lines) -->
```
NGROK_DOMAIN=heathless-art-unharsh.ngrok-free.dev
```

<!-- Decision: keep PM2 gsd-tunnel app (continuity with healthcheck + existing operator muscle memory). Tailscale's systemd daemon runs independently; gsd-tunnel only wraps `tailscale funnel --bg` + restart loop for resilience. -->
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Install Tailscale, authenticate, enable Funnel</name>
  <what-built>Nothing yet — this task sets up the prerequisites for the code changes in Task 2.</what-built>
  <how-to-verify>
Run these commands in order and confirm each step succeeds.

1. **Install Tailscale** (needs sudo):
   ```
   curl -fsSL https://tailscale.com/install.sh | sh
   which tailscale
   ```
   Expect: path like `/usr/bin/tailscale`.

2. **Authenticate** (opens browser URL, sign up if no account yet):
   ```
   sudo tailscale up
   ```
   Claude will print a URL like `https://login.tailscale.com/a/XXXX`. **You click it, sign in (or sign up), approve the machine.** Come back to the terminal — it will say "Success."

3. **Enable Funnel in admin console** (one-time checkbox):
   Open https://login.tailscale.com/admin/dns → scroll to "Tailscale Funnel" or "HTTPS Certificates" → enable MagicDNS + HTTPS certificates if not already on → open https://login.tailscale.com/admin/settings/features → toggle "Funnel" ON for your tailnet.

4. **Confirm Funnel is available** on this machine:
   ```
   tailscale funnel status
   ```
   Should NOT say "Funnel not available". If it does, the admin toggle wasn't applied — re-check step 3.

5. **Grab the machine's Funnel hostname** (will be used in Task 2):
   ```
   tailscale status --json | grep -m1 DNSName
   ```
   Example output: `"DNSName": "debian-xyz.tail-abcd.ts.net."` → your Funnel URL will be `https://debian-xyz.tail-abcd.ts.net` (strip trailing dot).

Paste the final `https://...ts.net` URL in your approval message so Task 2 and Task 3 can use it.
  </how-to-verify>
  <resume-signal>Reply "approved: https://&lt;your-machine&gt;.&lt;tailnet&gt;.ts.net" or describe what failed (e.g. "Funnel toggle missing in admin console").</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Rewrite tunnel scripts, env, and docs for Tailscale Funnel</name>
  <files>scripts/tunnel.sh, scripts/tunnel-setup.sh, .env, README.md</files>
  <action>
Use the Tailscale Funnel URL provided by the user in Task 1 (referred to below as `$FUNNEL_URL`, e.g. `https://debian-xyz.tail-abcd.ts.net`).

**1. Rewrite `scripts/tunnel.sh`** — replace the entire file with a Tailscale Funnel loop:
```sh
#!/usr/bin/env sh
# Tailscale Funnel launcher for GSD Dashboard.
#
# Replaces the previous ngrok wrapper (retired 2026-04-10 after ERR_NGROK_725
# bandwidth exhaustion on the free tier).
#
# Prereqs:
#   - tailscale installed and `sudo tailscale up` completed
#   - Funnel enabled for this tailnet (admin console)
# Env:
#   - DASHBOARD_PORT (default 4820)
#   - TAILSCALE_FUNNEL_URL (informational — used by Railway's GSD_DATA_URL)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
LOG_FILE="/data/home/gsddashboard/logs/gsd-tunnel.log"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

DASHBOARD_PORT="${DASHBOARD_PORT:-4820}"

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG_FILE"; }

# Reset any stale funnel config on startup so we always start clean.
tailscale funnel --bg=false reset >/dev/null 2>&1 || true

while true; do
  log "Starting Tailscale Funnel -> localhost:$DASHBOARD_PORT"
  # --bg backgrounds the funnel handler inside tailscaled and returns.
  # We then tail the log + sleep-loop so PM2 keeps the wrapper alive.
  if tailscale funnel --bg "$DASHBOARD_PORT" >>"$LOG_FILE" 2>&1; then
    log "Funnel registered. Entering supervise loop."
    # Check every 30s that funnel is still configured; if not, re-register.
    while tailscale funnel status 2>/dev/null | grep -q ":$DASHBOARD_PORT"; do
      sleep 30
    done
    log "Funnel status lost. Re-registering..."
  else
    log "tailscale funnel command failed (code $?). Retrying in 15s..."
    sleep 15
  fi
done
```
Make it executable: `chmod +x scripts/tunnel.sh`.

**2. Rewrite `scripts/tunnel-setup.sh`** — replace the ngrok instructions with Tailscale:
```sh
#!/usr/bin/env sh
# One-time setup guide for Tailscale Funnel.

echo ""
echo "======================================================"
echo "  GSD Dashboard — Tailscale Funnel Setup"
echo "======================================================"
echo ""
echo "Prerequisites:"
echo "  1. curl -fsSL https://tailscale.com/install.sh | sh"
echo "  2. sudo tailscale up   # browser auth"
echo "  3. Enable Funnel in admin console:"
echo "     https://login.tailscale.com/admin/settings/features"
echo ""
echo "Your machine's Funnel URL:"
echo "    tailscale status --json | grep DNSName"
echo ""
echo "Set it in .env as TAILSCALE_FUNNEL_URL and on Railway as GSD_DATA_URL."
echo ""
echo "Start the tunnel:"
echo "    pm2 restart gsd-tunnel"
echo "    # or: sh /data/home/gsddashboard/scripts/tunnel.sh"
echo ""
echo "Check status:"
echo "    tailscale funnel status"
echo "    pm2 logs gsd-tunnel --lines 20"
echo ""
```

**3. Update `.env`** — remove `NGROK_DOMAIN` line, add:
```
TAILSCALE_FUNNEL_URL=$FUNNEL_URL
```
(Use the exact URL from Task 1.)

**4. Update `README.md`** — the existing Remote Access section (around line 71-78) currently says cloudflared, which is wrong on multiple counts. Replace with:
```markdown
## Remote Access

The dashboard runs locally (GSD data lives on your machine). To expose it to
Railway (or any other remote host) so `/api/gsd/*` can be proxied through:

1. Install Tailscale: `curl -fsSL https://tailscale.com/install.sh | sh`
2. `sudo tailscale up` and approve the machine in your tailnet.
3. Enable Funnel at https://login.tailscale.com/admin/settings/features
4. Set `TAILSCALE_FUNNEL_URL=https://<machine>.<tailnet>.ts.net` in `.env`.
5. On Railway, set `GSD_DATA_URL` to the same URL.
6. Start the supervisor: `pm2 restart gsd-tunnel` (runs `scripts/tunnel.sh`).

The server proxies `/api/gsd/*` requests and the terminal WebSocket through
that URL. If it goes down, Railway serves cached snapshots until it's back.
```

**5. Reload PM2 tunnel app** to pick up the new script:
```
pm2 restart gsd-tunnel
pm2 logs gsd-tunnel --lines 20 --nostream
```
Confirm the log shows "Funnel registered" and not an ngrok error.

**6. Smoke test from this machine**:
```
curl -sS -o /dev/null -w "%{http_code}\n" "$FUNNEL_URL/api/health"
```
Must return `200`. If 502, wait 5s and retry (tailscaled sometimes needs a beat).
  </action>
  <verify>
    <automated>curl -sS -o /dev/null -w "%{http_code}" "$(grep TAILSCALE_FUNNEL_URL .env | cut -d= -f2)/api/health" | grep -q 200 && pm2 jlist | node -e "const a=JSON.parse(require('fs').readFileSync(0));const t=a.find(x=>x.name==='gsd-tunnel');process.exit(t&&t.pm2_env.status==='online'?0:1)"</automated>
  </verify>
  <done>
- `scripts/tunnel.sh` executes `tailscale funnel --bg 4820` (no `ngrok` string anywhere)
- `scripts/tunnel-setup.sh` no longer mentions ngrok
- `.env` has `TAILSCALE_FUNNEL_URL=...` and no `NGROK_DOMAIN`
- `README.md` Remote Access section mentions Tailscale (not cloudflared, not ngrok)
- `pm2 jlist` shows `gsd-tunnel` status `online`
- `curl $TAILSCALE_FUNNEL_URL/api/health` returns 200
  </done>
</task>

<task type="auto">
  <name>Task 3: Update Railway GSD_DATA_URL and redeploy</name>
  <files>(no repo files — Railway variables only)</files>
  <action>
Switch the Railway backend to proxy through the new Tailscale Funnel URL.

1. Point Railway at the Funnel URL (use the same value from `.env`):
   ```
   FUNNEL_URL=$(grep TAILSCALE_FUNNEL_URL /data/home/gsddashboard/.env | cut -d= -f2-)
   railway variables --set "GSD_DATA_URL=$FUNNEL_URL"
   ```

2. Trigger a deploy so the new env var takes effect (Railway does NOT auto-deploy from var changes alone on this project):
   ```
   railway up --detach
   ```

3. Wait for deploy to reach RUNNING:
   ```
   # Poll every 10s, max 6 tries
   for i in 1 2 3 4 5 6; do
     STATUS=$(railway status --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).deployments?.[0]?.status||'UNKNOWN')}catch(e){console.log('ERR')}})")
     echo "Attempt $i: $STATUS"
     [ "$STATUS" = "SUCCESS" ] && break
     sleep 10
   done
   ```

4. Restart the Railway-side `gsd-dashboard` process by redeploying (already covered by `railway up`) — but ALSO restart the local PM2 `gsd-dashboard` app so its proxy cache is cold:
   ```
   pm2 restart gsd-dashboard
   ```
   (Per v4.3 Phase 44 decision: Railway proxy mode requires local PM2 restart after backend-touching changes.)

5. Verify end-to-end from the outside:
   ```
   curl -sS https://gsd-dashboard-production.up.railway.app/api/gsd/ws-base
   ```
   Response `wsBase` must contain the new `ts.net` hostname (wss://), not `ngrok-free.dev`.
  </action>
  <verify>
    <automated>curl -sS https://gsd-dashboard-production.up.railway.app/api/gsd/ws-base | grep -q "ts.net" && ! curl -sS https://gsd-dashboard-production.up.railway.app/api/gsd/ws-base | grep -q "ngrok"</automated>
  </verify>
  <done>
- `railway variables` shows `GSD_DATA_URL` set to the Tailscale Funnel URL
- `railway up --detach` deploy reached SUCCESS
- Local PM2 `gsd-dashboard` restarted (proxy cache cleared)
- `/api/gsd/ws-base` returns `wsBase` with `.ts.net` host (not ngrok)
  </done>
</task>

<task type="auto">
  <name>Task 4: Clean up zombie test + tmux processes</name>
  <files>(no repo files — process state only)</files>
  <action>
Kill specific zombie processes identified in the diagnosis. **Be surgical** — do NOT `pkill node` or `pkill tmux`. Preserve the live `gsd-dashboard` PM2 app and the active `KidAI` tmux session.

1. **Snapshot current state** for safety and the summary:
   ```
   ps -eo pid,etime,args | grep -E "node --test server/__tests__|tmux (send-keys|attach-session)" | grep -v grep > /tmp/gsd-tunnel-zombies-before.txt
   cat /tmp/gsd-tunnel-zombies-before.txt
   ```

2. **Kill zombie `node --test` processes** (only ones running > 24h — fresh test runs from active sessions should have short etime like `00:05`):
   ```
   ps -eo pid,etimes,args | awk '$2 > 86400 && /node --test server\/__tests__/ {print $1}' | while read pid; do
     echo "Killing node test zombie PID $pid"
     kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
   done
   ```

3. **Kill stale `tmux send-keys` processes** (> 24h old — a healthy `send-keys` exits in milliseconds, so anything lingering is stuck):
   ```
   ps -eo pid,etimes,args | awk '$2 > 86400 && /tmux send-keys/ {print $1}' | while read pid; do
     echo "Killing stale tmux send-keys PID $pid"
     kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
   done
   ```

4. **Kill dangling `tmux attach-session` on dead ptys** — but ONLY if the attached session is NOT in `tmux ls` (i.e. already gone). The KidAI attach must survive because the session is still active.
   ```
   ACTIVE_SESSIONS=$(tmux ls 2>/dev/null | cut -d: -f1 | tr '\n' '|' | sed 's/|$//')
   ps -eo pid,etimes,args | awk '$2 > 86400 && /tmux attach-session/ {print}' | while read line; do
     pid=$(echo "$line" | awk '{print $1}')
     target=$(echo "$line" | grep -oE "\-t [A-Za-z0-9_-]+" | awk '{print $2}')
     if [ -n "$target" ] && echo "$ACTIVE_SESSIONS" | grep -qx "$target"; then
       echo "Keeping PID $pid — session '$target' still active"
     else
       echo "Killing dangling tmux attach PID $pid (session '$target' gone)"
       kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
     fi
   done
   ```

5. **Verify live processes untouched**:
   ```
   pm2 jlist | node -e "const a=JSON.parse(require('fs').readFileSync(0));const d=a.find(x=>x.name==='gsd-dashboard');console.log('gsd-dashboard:',d?.pm2_env?.status)"
   tmux ls 2>/dev/null
   ```
   `gsd-dashboard` must still be `online` and `tmux ls` must still list KidAI (if it was there before).

6. **Snapshot after**:
   ```
   ps -eo pid,etime,args | grep -E "node --test server/__tests__|tmux (send-keys|attach-session)" | grep -v grep > /tmp/gsd-tunnel-zombies-after.txt
   diff /tmp/gsd-tunnel-zombies-before.txt /tmp/gsd-tunnel-zombies-after.txt || true
   ```
  </action>
  <verify>
    <automated>test $(ps -eo etimes,args | awk '$1 > 86400 && /node --test server\/__tests__/' | wc -l) -eq 0 && test $(ps -eo etimes,args | awk '$1 > 86400 && /tmux send-keys/' | wc -l) -eq 0 && pm2 jlist | grep -q '"name":"gsd-dashboard"'</automated>
  </verify>
  <done>
- No `node --test server/__tests__` processes older than 24h remain
- No `tmux send-keys` processes older than 24h remain
- Dangling `tmux attach-session` on dead sessions killed; active KidAI attach preserved
- `gsd-dashboard` PM2 app still `online`
- Before/after diff captured in `/tmp/gsd-tunnel-zombies-*.txt`
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5: Verify live terminal on Railway URL</name>
  <what-built>Tailscale Funnel replacing ngrok, Railway redeployed pointing at it, zombie processes cleaned up.</what-built>
  <how-to-verify>
1. Open https://gsd-dashboard-production.up.railway.app in your browser.
2. Navigate to the GSD projects list — confirm it loads (status cards render, not a blank screen or "loading forever"). This proves the Railway → Funnel proxy works for `/api/gsd/projects`.
3. Click into the **gsddashboard** project (it has an active KidAI-adjacent tmux session — or pick any project with an active tmux session).
4. Open its terminal pane. Within ~2 seconds you should see:
   - Connection status dot turn green (or equivalent "connected" state)
   - Live pty output streaming (prompt, cursor, any running tmux content)
5. Type a harmless character (e.g. space then backspace) and confirm the local tmux echoes it. This proves the WebSocket is bidirectional through Tailscale Funnel.
6. Open DevTools → Network → WS tab. Confirm the WebSocket URL is `wss://<something>.ts.net/ws/terminal/...` (NOT `wss://heathless-art-unharsh.ngrok-free.dev/...`).
7. Check Status: 101 Switching Protocols (not 403).

If any step fails, describe exactly which step and the error. Specifically note:
- Is it a 403? (Funnel not enabled or wrong URL)
- Is it 502/timeout? (tailscaled not registered — check `pm2 logs gsd-tunnel`)
- Does the page load but terminal stays grey? (check `/api/gsd/ws-base` response)
- Is DevTools WS URL still ngrok? (Railway env var didn't update or gsd-dashboard PM2 needs another restart)
  </how-to-verify>
  <resume-signal>Type "approved" if the terminal streams live pty output, or describe the exact failure step + symptom.</resume-signal>
</task>

</tasks>

<verification>
End-to-end verification: the live Railway URL's terminal feature works, which proves:
1. Tailscale Funnel is serving HTTPS from this machine
2. Railway `GSD_DATA_URL` points at it
3. `/api/gsd/ws-base` returns the new wss URL
4. Browser opens WS through Funnel and pty output streams

Plus: zombie processes are gone, live services untouched, docs are current.
</verification>

<success_criteria>
- [ ] `curl $TAILSCALE_FUNNEL_URL/api/health` returns 200 from outside the tailnet
- [ ] `curl https://gsd-dashboard-production.up.railway.app/api/gsd/ws-base` returns `wsBase` with `.ts.net` host
- [ ] Live terminal on Railway streams pty output (user-verified in Task 5)
- [ ] Zero `ngrok` references remain in `scripts/`, `.env`, `README.md`
- [ ] `pm2 jlist` shows `gsd-dashboard`, `gsd-tunnel`, `gsd-healthcheck` all online
- [ ] No `node --test server/__tests__` or `tmux send-keys` processes > 24h old
- [ ] `tmux ls` still shows any previously-active sessions (KidAI preserved)
</success_criteria>

<output>
After completion, create `.planning/quick/43-switch-tunnel-from-ngrok-to-tailscale-fu/43-SUMMARY.md` with:
- New Tailscale Funnel URL
- PIDs/patterns of zombies killed (from before/after diff)
- Commit hashes for script + docs changes and for Railway deploy
- Any gotchas hit (Funnel toggle location, tailscaled restart quirks, etc.)
</output>
