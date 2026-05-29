---
phase: quick
plan: 260529-vpz
type: execute
wave: 1
depends_on: []
files_modified:
  - /home/services/playwright-daemon/server.js
  - /home/services/playwright-daemon/client.js
  - /home/services/playwright-daemon/package.json
  - /home/services/.env.production
  - /home/claude/.claude/projects/-home-services-gsddashboard/memory/feedback_playwright_auto.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "POST /job accepts JS code string, executes it with page in scope, returns result"
    - "GET /status returns { busy, queueDepth }"
    - "Jobs queue FIFO and run one at a time — no parallel Chromium instances"
    - "Browser stays alive between jobs, restarts on crash"
    - "PM2 service named playwright-daemon running as claude user"
    - "client.js usable from any project to submit jobs"
  artifacts:
    - path: /home/services/playwright-daemon/server.js
      provides: HTTP daemon with job queue and browser lifecycle
    - path: /home/services/playwright-daemon/client.js
      provides: Thin POST helper for other projects
    - path: /home/services/playwright-daemon/package.json
      provides: Node module descriptor
  key_links:
    - from: client.js
      to: server.js
      via: POST http://localhost:3099/job
---

<objective>
Build a shared Playwright daemon at /home/services/playwright-daemon/ — a persistent Node.js HTTP service that queues Playwright jobs and processes them one at a time through a single long-lived Chromium instance. Other projects post JS snippets (evaluated with `page` in scope) and get results back synchronously.

Purpose: Eliminates per-script Chromium cold-starts, enforces the single-instance memory constraint system-wide, and provides a stable integration point for all VPS automation.
Output: Running PM2 service + client helper + updated env + updated memory file.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@/home/services/gsddashboard/.planning/STATE.md

System Playwright: /usr/lib/node_modules/playwright
Chromium cache: ~/.cache/ms-playwright/chromium-1217/chrome-linux/chrome (already installed)
PM2 binary: /usr/bin/pm2
VPS memory cap: 3.7GB total, claude user cgroup-capped at 2.4GB
Required browser args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create daemon server and client</name>
  <files>
    /home/services/playwright-daemon/server.js
    /home/services/playwright-daemon/client.js
    /home/services/playwright-daemon/package.json
  </files>
  <action>
Create /home/services/playwright-daemon/ with three files:

**package.json** — minimal, no dependencies (playwright is required via absolute path):
```json
{
  "name": "playwright-daemon",
  "version": "1.0.0",
  "description": "Shared Playwright job queue daemon",
  "main": "server.js",
  "scripts": { "start": "node server.js" }
}
```

**server.js** — HTTP server on port 3099:
- Require playwright from /usr/lib/node_modules/playwright (chromium)
- Browser launch args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
- `launchBrowser()` helper: launches chromium lazily, sets `browser` and `page` globals; on disconnect, sets both to null so next job re-launches
- Job queue: array of { script, resolve, reject } items; `busy` boolean flag
- `processQueue()`: if busy or empty, return; set busy=true, dequeue one job; ensure browser/page alive (call launchBrowser if null); wrap `eval(job.script)` in an async IIFE with `page` injected into scope via `with(ctx)` — use `const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor; const fn = new AsyncFunction('page','browser', job.script); await fn(page, browser)` — capture return value as result; resolve with { result }; on any error, reject with { error: err.message }; set busy=false and call processQueue() again
- POST /job: parse JSON body, validate `script` is a string, push to queue, return promise result as JSON response (wait for job to complete before responding — use a Promise wrapper)
- GET /status: return JSON { busy, queueDepth: queue.length }
- Handle SIGTERM/SIGINT: close browser if open, then process.exit(0)
- Listen on 127.0.0.1:3099 (localhost only — not exposed externally)
- Log startup: `[playwright-daemon] Listening on http://localhost:3099`

**client.js** — thin helper:
```js
// Usage: const { runPlaywright } = require('/home/services/playwright-daemon/client.js')
// const result = await runPlaywright(`return await page.title()`)
const http = require('http');
const DAEMON_URL = process.env.PLAYWRIGHT_DAEMON_URL || 'http://localhost:3099';

async function runPlaywright(script, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ script });
    const url = new URL(DAEMON_URL + '/job');
    const req = http.request({
      hostname: url.hostname, port: url.port || 3099,
      path: '/job', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { const j = JSON.parse(data); j.error ? reject(new Error(j.error)) : resolve(j.result); }
        catch(e) { reject(e); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('playwright-daemon timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getStatus() {
  return new Promise((resolve, reject) => {
    http.get(DAEMON_URL + '/status', (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

module.exports = { runPlaywright, getStatus };
```
  </action>
  <verify>
    <automated>node -e "require('/home/services/playwright-daemon/server.js')" 2>&1 | head -3 || true; node -c /home/services/playwright-daemon/server.js && node -c /home/services/playwright-daemon/client.js && echo "syntax OK"</automated>
  </verify>
  <done>server.js and client.js pass node syntax check; package.json exists</done>
</task>

<task type="auto">
  <name>Task 2: Register PM2 service and update env + memory file</name>
  <files>
    /home/services/.env.production
    /home/claude/.claude/projects/-home-services-gsddashboard/memory/feedback_playwright_auto.md
  </files>
  <action>
Step 1 — Add PM2 service as claude user:
```bash
pm2 start /home/services/playwright-daemon/server.js \
  --name playwright-daemon \
  --interpreter node \
  --log /home/services/playwright-daemon/daemon.log \
  --restart-delay 2000 \
  --max-restarts 10
pm2 save
```

Step 2 — Check if PLAYWRIGHT_DAEMON_URL is in /home/services/.env.production; if not, append:
```
PLAYWRIGHT_DAEMON_URL=http://localhost:3099
```

Step 3 — Verify daemon is up:
```bash
curl -s http://localhost:3099/status
```
Should return `{"busy":false,"queueDepth":0}`.

Step 4 — Run a smoke test job:
```bash
node -e "
const { runPlaywright } = require('/home/services/playwright-daemon/client.js');
runPlaywright('return await page.url()').then(r => console.log('smoke test:', r)).catch(e => console.error('FAIL:', e.message));
"
```

Step 5 — Update /home/claude/.claude/projects/-home-services-gsddashboard/memory/feedback_playwright_auto.md:
Append a new section at the end of the file:

```markdown

**Shared Playwright Daemon (added 2026-05-29):**
- A persistent PM2 service (`playwright-daemon`) runs at `http://localhost:3099` on the VPS
- Single Chromium instance shared across all projects — enforces one-at-a-time constraint automatically
- POST /job with `{ script: "JS string with page in scope" }` — blocks until done, returns `{ result }` or `{ error }`
- GET /status returns `{ busy, queueDepth }`
- Client helper: `const { runPlaywright } = require('/home/services/playwright-daemon/client.js')`
- Env var: `PLAYWRIGHT_DAEMON_URL=http://localhost:3099` (in /home/services/.env.production)
- Prefer the daemon over spawning raw Playwright scripts — eliminates cold-start and memory spikes
- If daemon is down: `pm2 restart playwright-daemon` or `pm2 start playwright-daemon`
```
  </action>
  <verify>
    <automated>curl -s http://localhost:3099/status && pm2 list | grep playwright-daemon && grep PLAYWRIGHT_DAEMON_URL /home/services/.env.production</automated>
  </verify>
  <done>pm2 list shows playwright-daemon online; /status returns JSON; env var present; memory file updated</done>
</task>

</tasks>

<verification>
```bash
# Service running
pm2 show playwright-daemon | grep -E "status|uptime"

# Status endpoint
curl -s http://localhost:3099/status

# Full smoke test via client
NODE_PATH=/usr/lib/node_modules node -e "
const { runPlaywright, getStatus } = require('/home/services/playwright-daemon/client.js');
async function test() {
  console.log('status:', await getStatus());
  const title = await runPlaywright(\`
    await page.goto('about:blank');
    return await page.title();
  \`);
  console.log('page title:', title);
}
test().then(() => console.log('PASS')).catch(e => console.error('FAIL:', e.message));
"
```
</verification>

<success_criteria>
- `pm2 list` shows playwright-daemon with status "online"
- `curl http://localhost:3099/status` returns `{"busy":false,"queueDepth":0}`
- Smoke test job returns without error
- PLAYWRIGHT_DAEMON_URL in /home/services/.env.production
- feedback_playwright_auto.md documents the daemon
</success_criteria>

<output>
No SUMMARY.md required — this is a quick task. Confirm completion inline.
</output>
