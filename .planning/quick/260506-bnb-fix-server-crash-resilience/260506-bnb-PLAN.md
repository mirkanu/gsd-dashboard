---
phase: quick-260506-bnb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - /etc/systemd/system/pm2-claude.service
  - /usr/local/bin/claude
  - /home/services/gsddashboard/scripts/memory-guard.sh
autonomous: false
requirements: []
must_haves:
  truths:
    - "Hung node --test processes are dead (no PIDs 45452, 45453, 45818, 46841, 47009, 50582, 50889)"
    - "PM2 daemon is running under the claude user and systemd will restart it on failure"
    - "pm2-root.service is disabled and masked"
    - "Running claude as root auto-delegates to the claude user"
    - "memory-guard automatically kills root-owned hung test processes (no manual intervention needed)"
  artifacts:
    - path: "/etc/systemd/system/pm2-claude.service"
      provides: "Forking systemd unit with Restart=on-failure for PM2"
    - path: "/usr/local/bin/claude"
      provides: "Wrapper script that runuser-delegates to claude when invoked as root"
    - path: "/home/services/gsddashboard/scripts/memory-guard.sh"
      provides: "Updated guard that uses sudo kill for root-owned processes"
  key_links:
    - from: "pm2-claude.service"
      to: "/home/claude/.pm2/pm2.pid"
      via: "PIDFile directive — systemd tracks PM2 daemon liveness"
    - from: "/usr/local/bin/claude"
      to: "/usr/bin/claude"
      via: "PATH precedence — /usr/local/bin is before /usr/bin"
    - from: "memory-guard.sh cron"
      to: "root-owned node --test PIDs"
      via: "sudo kill (claude has NOPASSWD:ALL sudoers)"
---

<objective>
Fix the six root causes of PM2 server crashes on the Hetzner VPS.

Purpose: Eliminate recurring PM2 death from hung test processes and ensure PM2 auto-restarts under systemd. Harden the environment so root-CLI and memory-guard both work correctly going forward.

Output: Dead hung processes, resilient PM2 service, masked wrong-user service, working claude wrapper, self-healing memory-guard.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/services/gsddashboard/.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Kill hung processes and fix pm2-claude.service + disable pm2-root.service</name>
  <files>/etc/systemd/system/pm2-claude.service</files>
  <action>
Run as root (sudo available to claude user with NOPASSWD:ALL).

Step 1 — Kill all hung node --test PIDs immediately:
```
sudo kill -9 45452 45453 45818 46841 47009 50582 50889 2>/dev/null || true
```
Verify none remain: `ps -p 45452,45453,45818,46841,47009,50582,50889 2>/dev/null` should return nothing.

Step 2 — Rewrite /etc/systemd/system/pm2-claude.service. The current file has `Type=oneshot` + `RemainAfterExit=yes` which means systemd never detects PM2 dying. Change to `Type=forking` so systemd tracks the daemon PID and can restart it. Full replacement content:

```ini
[Unit]
Description=PM2 process manager
Documentation=https://pm2.keymetrics.io/
After=network.target

[Service]
Type=forking
User=claude
PIDFile=/home/claude/.pm2/pm2.pid
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin:/usr/bin:/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
Environment=PM2_HOME=/home/claude/.pm2

ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect
ExecReload=/usr/lib/node_modules/pm2/bin/pm2 reload all
ExecStop=/usr/lib/node_modules/pm2/bin/pm2 kill

Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Step 3 — Disable and mask pm2-root.service (wrong user, would fail):
```
sudo systemctl disable --now pm2-root.service 2>/dev/null || true
sudo systemctl mask pm2-root.service
```

Step 4 — Reload systemd and restart pm2-claude.service:
```
sudo systemctl daemon-reload
sudo systemctl restart pm2-claude.service
```

Step 5 — Bring PM2 processes back online (PM2 daemon is fresh, resurrect from saved list):
```
sudo -u claude PM2_HOME=/home/claude/.pm2 /usr/lib/node_modules/pm2/bin/pm2 resurrect || true
sudo -u claude PM2_HOME=/home/claude/.pm2 /usr/lib/node_modules/pm2/bin/pm2 status
```
  </action>
  <verify>
    <automated>
sudo systemctl is-active pm2-claude.service
sudo -u claude PM2_HOME=/home/claude/.pm2 /usr/lib/node_modules/pm2/bin/pm2 pid
sudo systemctl is-masked pm2-root.service
ps -p 45452,45453,45818,46841,47009,50582,50889 2>/dev/null | wc -l
    </automated>
  </verify>
  <done>
- `systemctl is-active pm2-claude.service` returns "active"
- `pm2 pid` returns a PID (daemon alive)
- `systemctl is-masked pm2-root.service` returns "masked"
- `ps -p ...` returns 0 lines (all hung PIDs dead)
  </done>
</task>

<task type="auto">
  <name>Task 2: Create /usr/local/bin/claude root-delegation wrapper</name>
  <files>/usr/local/bin/claude</files>
  <action>
Create /usr/local/bin/claude as a bash wrapper that transparently delegates to the real claude binary via runuser when called as root, or execs directly when called as any other user.

/usr/local/bin is earlier in PATH (/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin) so this wrapper intercepts `claude` invocations before /usr/bin/claude.

File content:
```bash
#!/usr/bin/env bash
# /usr/local/bin/claude — root-delegation wrapper
# When run as root, re-execs as the claude OS user so --dangerously-skip-permissions works.
# The real binary is at /usr/bin/claude -> /usr/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe

REAL_CLAUDE=/usr/bin/claude

if [[ "$(id -u)" -eq 0 ]]; then
  exec runuser -u claude -- "$REAL_CLAUDE" "$@"
else
  exec "$REAL_CLAUDE" "$@"
fi
```

After writing the file:
```
sudo chmod +x /usr/local/bin/claude
```

Verify PATH ordering:
```
which claude   # must return /usr/local/bin/claude, not /usr/bin/claude
```
  </action>
  <verify>
    <automated>
which claude
head -3 /usr/local/bin/claude
ls -la /usr/local/bin/claude
    </automated>
  </verify>
  <done>
- `which claude` returns `/usr/local/bin/claude`
- File is executable
- File contains the runuser delegation logic
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix memory-guard to auto-kill root-owned processes via sudo</name>
  <files>/home/services/gsddashboard/scripts/memory-guard.sh</files>
  <action>
The memory-guard cron runs as the `claude` user (confirmed: crontab -l shows it in claude's crontab). The `claude` user has `NOPASSWD: ALL` sudo access (confirmed: `sudo -l` output). Therefore we can replace the "NOTICE: run sudo kill manually" path with an actual `sudo kill`.

Replace the block:
```bash
if [[ "$owner" == "root" ]] && [[ "$(whoami)" != "root" ]]; then
  log "  NOTICE: PID $pid is owned by root — run 'sudo kill $pid' manually to terminate."
else
  if kill "$pid" 2>/dev/null; then
    log "  Killed PID $pid (owner=$owner)."
  else
    log "  Failed to kill PID $pid (owner=$owner) — may need sudo."
  fi
fi
```

With:
```bash
if kill "$pid" 2>/dev/null; then
  log "  Killed PID $pid (owner=$owner)."
elif sudo kill "$pid" 2>/dev/null; then
  log "  Killed PID $pid via sudo (owner=$owner)."
else
  log "  Failed to kill PID $pid (owner=$owner) — escalation failed."
fi
```

This makes the kill path: try direct kill first (works when owner matches), then sudo kill (works for root-owned processes since claude has NOPASSWD:ALL). No sudoers changes needed — the existing entry covers this.

After editing, verify the script is syntactically valid:
```
bash -n /home/services/gsddashboard/scripts/memory-guard.sh
```
  </action>
  <verify>
    <automated>bash -n /home/services/gsddashboard/scripts/memory-guard.sh && echo "syntax OK"</automated>
  </verify>
  <done>
- Script passes `bash -n` syntax check
- The NOTICE/manual-kill branch is removed
- Direct kill + sudo kill fallback is in place
- Log entries will say "Killed PID X via sudo" rather than "NOTICE: run sudo kill manually"
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    - Killed 7 hung node --test PIDs (45452, 45453, 45818, 46841, 47009, 50582, 50889)
    - Fixed pm2-claude.service: Type=forking, PIDFile, Restart=on-failure
    - Disabled and masked pm2-root.service
    - Created /usr/local/bin/claude root-delegation wrapper
    - Fixed memory-guard.sh to auto-kill root-owned processes via sudo
  </what-built>
  <how-to-verify>
1. Confirm PM2 is alive and dashboard is accessible:
   ```
   sudo -u claude PM2_HOME=/home/claude/.pm2 /usr/lib/node_modules/pm2/bin/pm2 status
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
   ```
   Expect: gsd-dashboard process shows "online", health returns 200.

2. Confirm systemd service is active with correct Type:
   ```
   sudo systemctl status pm2-claude.service
   ```
   Expect: "active (running)" — NOT "active (exited)".

3. Confirm pm2-root.service is masked:
   ```
   sudo systemctl status pm2-root.service
   ```
   Expect: "masked".

4. Confirm claude wrapper is in place:
   ```
   which claude
   ```
   Expect: /usr/local/bin/claude

5. Check memory-guard log after next cron tick (waits up to 5 min) or trigger manually:
   ```
   bash /home/services/gsddashboard/scripts/memory-guard.sh
   tail -5 /home/claude/.pm2/logs/memory-guard.log
   ```
   Expect: "No hung node --test processes found" (since we killed them all in Task 1).

6. Run `npm run build && pm2 restart gsd-dashboard` per MEMORY.md deploy policy.
  </how-to-verify>
  <resume-signal>Type "approved" when dashboard is confirmed up, or describe any issues found.</resume-signal>
</task>

</tasks>

<verification>
Full system health after all tasks:
- `sudo systemctl is-active pm2-claude.service` → active (running, not exited)
- `sudo systemctl is-masked pm2-root.service` → masked
- `which claude` → /usr/local/bin/claude
- `bash -n /home/services/gsddashboard/scripts/memory-guard.sh` → syntax OK
- Dashboard accessible at http://localhost:3000
- No PIDs from the hung list survive `ps`
</verification>

<success_criteria>
- PM2 daemon survives VPS reboots and auto-restarts on crash via systemd
- Running `claude` as root auto-delegates to claude user (--dangerously-skip-permissions works)
- memory-guard silently kills root-owned hung test processes every 5 minutes without manual intervention
- No hung node --test processes remain from the May 2 accumulation
- The test:server timeout (already set to 30000ms in package.json) prevents future accumulation
</success_criteria>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| root → claude user | /usr/local/bin/claude wrapper switches execution context; must only delegate to the fixed real binary path, not user-controlled input |
| cron → sudo kill | memory-guard invokes sudo kill on arbitrary PIDs matching a filter; filter is ps-pattern-based, not user-input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bnb-01 | Elevation of Privilege | /usr/local/bin/claude wrapper | mitigate | Wrapper execs a hardcoded absolute path (/usr/bin/claude) — $@ passes only args, not the binary. No PATH injection possible. |
| T-bnb-02 | Tampering | memory-guard sudo kill | accept | PIDs are extracted from ps output filtered to `node --test` processes older than 10 min. False-positive kill of a legitimate long-running test would be acceptable (10 min threshold is generous). |
| T-bnb-03 | Denial of Service | pm2-claude.service Restart=on-failure | accept | Rapid restart loops are bounded by RestartSec=5s. If PM2 fails persistently, systemd rate-limits retries. Low risk in practice. |
</threat_model>

<output>
After completion, create `.planning/quick/260506-bnb-fix-server-crash-resilience/260506-bnb-SUMMARY.md` following the standard summary template.
</output>
