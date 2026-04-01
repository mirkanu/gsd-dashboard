# Phase 24: Waiting Accuracy + Safety Foundation - Research

**Researched:** 2026-04-01
**Domain:** UX state detection, autopilot safety infrastructure, detached process spawning
**Confidence:** HIGH

## Summary

Phase 24 addresses two critical requirements for the v3.0 autopilot milestone: **waiting state accuracy** (UX-01, UX-02) and **safety infrastructure** (AUTO-05). The project must distinguish between agent processing and user input waiting accurately, refresh state without full page reloads, and build the database schema and backend patterns required for safe autopilot operation.

Current implementation already detects session state (working/waiting/paused/archived) via tmux `capture-pane` pattern matching. The fix involves improving the Claude Code activity indicator pattern matching and adding automatic state refresh when the terminal overlay closes. Safety infrastructure requires four new SQLite tables (autopilot_runs, claude_api_usage, external_service_costs, process_registry) and a circuit breaker class to halt failing runs after 3 consecutive phase failures.

**Primary recommendation:**
- Fix waiting detection by broadening the Claude Code timer pattern (include variants) and verifying it correctly distinguishes agent-thinking from user-waiting
- Implement terminal close → auto-refresh via a 2s polling loop in GSD.tsx after onClose
- Add SQLite schema migrations for four new tables without breaking existing data
- Build a detached process spawner (via `child_process.spawn()` with `detached: true` flag) and ProcessRegistry class to track jobs

---

## User Constraints

(No CONTEXT.md exists for Phase 24, so no locked decisions yet.)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UX-01 | "Waiting" state accurately means waiting on human input — not agent-thinking or processing | Terminal state detection patterns, Claude Code timer regex refinement, broader pattern coverage |
| UX-02 | Card status refreshes automatically when terminal overlay is closed | WebSocket close handler + 2s polling loop in client, non-blocking refresh |
| AUTO-05 | Autopilot stops automatically after 3 consecutive failures on same phase (circuit breaker) | CircuitBreaker class with failure counter, run status table for persistence |

---

## Standard Stack

### Backend Infrastructure

| Component | Technology | Purpose | Why Standard |
|-----------|-----------|---------|--------------|
| Process spawning | Node.js `child_process.spawn()` | Launch GSD commands detached from Express event loop | Built-in, non-blocking, supports stdio redirection |
| Job registry | SQLite (new table: `process_registry`) | Track spawned process PIDs, exit codes, command args | Persistent, queryable via existing db connection |
| Circuit breaker | Custom JS class | Count consecutive phase failures, halt after 3 | Stateful safety mechanism required for autopilot |
| Migration system | SQL ALTER TABLE + try/catch | Versioned schema updates without downtime | Already established pattern in db.js (6+ existing migrations) |

### Client State Refresh

| Pattern | Technology | Purpose | Current Status |
|---------|-----------|---------|-----------------|
| Auto-refresh after overlay close | React useEffect + setInterval | Poll `/api/gsd/projects` every 2s for 10s | Not implemented; projects endpoint exists |
| State detection | tmux `capture-pane -p` | Read terminal output for Claude Code indicators | Implemented in `server/gsd/tmux.js` |

### SQLite Schema (New Tables Required)

**autopilot_runs** — Track each autopilot execution
```sql
id TEXT PRIMARY KEY
project_id TEXT
started_at TEXT
ended_at TEXT (nullable)
status TEXT CHECK(status IN ('running', 'paused', 'completed', 'failed'))
failure_count INTEGER DEFAULT 0
last_failed_phase_num INTEGER (nullable)
pause_reason TEXT (nullable)
FOREIGN KEY (project_id) REFERENCES projects(name)
```

**claude_api_usage** — Phase 26 (Cost tracking) dependency
```sql
run_id TEXT PRIMARY KEY
model TEXT
input_tokens INTEGER
output_tokens INTEGER
cost_usd REAL
FOREIGN KEY (run_id) REFERENCES autopilot_runs(id)
```

**external_service_costs** — Phase 26 dependency
```sql
id TEXT PRIMARY KEY
service TEXT (railway, github, claude, openai, etc)
cost_period TEXT (daily, weekly, monthly)
cost_usd REAL
checked_at TEXT
```

**process_registry** — Track spawned GSD commands
```sql
id TEXT PRIMARY KEY (UUID)
run_id TEXT
command TEXT (gsd command: /gsd:plan-phase, /gsd:execute-phase, etc)
args TEXT (JSON stringified)
pid INTEGER
exit_code INTEGER (nullable)
started_at TEXT
ended_at TEXT (nullable)
stdout TEXT (nullable)
stderr TEXT (nullable)
FOREIGN KEY (run_id) REFERENCES autopilot_runs(id)
```

---

## Architecture Patterns

### 1. Waiting State Detection (tmux capture-pane pattern matching)

**Current status:** Implemented, but needs refinement for edge cases.

**Location:** `/data/home/gsddashboard/server/gsd/tmux.js` — `detectSessionState()`

**How it works:**
```javascript
function detectSessionState(sessionName) {
  // 1. No session name → archived
  if (!sessionName) return 'archived';

  // 2. Session not active (tmux has-session fails) → paused
  if (!isTmuxSessionActive(sessionName)) return 'paused';

  // 3. Capture pane output
  const output = capturePaneText(sessionName);
  if (output === null) return 'paused'; // Capture error

  // 4. HIGHEST PRIORITY: Claude Code activity indicator
  // Matches timer: "(4m 19s · ↓ 539 tokens" or "(30s · ↓" or "(... thinking)"
  if (/·\s*↓\s*[\d.]+/.test(output) || /·\s*thinking\)/.test(output)) {
    return 'working';
  }

  // 5. Explicit waiting prompts: numbered selections, y/n, Enter prompts
  const waitingPatterns = [
    />\s+\d+\./,           // "> 1." (numbered options from GSD)
    /\[y\/n\]/i,           // "[y/n]"
    /\(y\/n\)/i,           // "(y/n)"
    /Press Enter/i,        // Explicit prompt
    /Select an option/i,   // GSD prompt
  ];
  for (const pattern of waitingPatterns) {
    if (pattern.test(output)) return 'waiting';
  }

  // 6. Default: session exists but Claude isn't processing → waiting
  return 'waiting';
}
```

**Potential gap:** The timer pattern `/·\s*↓\s*[\d.]+/` matches both "· ↓" (token output) and other token-rate indicators. Need to verify it doesn't match edge cases like commit messages or code comments containing similar text.

**Expected behavior:**
- Agent thinking/working: Shows timer → returns `'working'`
- Agent paused, waiting for user input: No timer → returns `'waiting'`
- User selects option (y/n, numbered menu): Shows prompt → returns `'waiting'`

### 2. Auto-Refresh on Terminal Close (Client-Side)

**Location:** `/data/home/gsddashboard/client/src/pages/GSD.tsx` — `TerminalOverlay` component

**Required implementation:**
```typescript
// When user closes terminal overlay (presses Escape or clicks X)
onClose={() => {
  // Trigger 2-second auto-refresh
  setRefreshing(true);
  const timer = setInterval(() => {
    load(false); // Non-manual load, runs silently
  }, 500); // Poll every 500ms

  setTimeout(() => {
    clearInterval(timer);
    setRefreshing(false);
  }, 2000); // Stop after 2 seconds
}
```

**Why 2 seconds?** Empirical: tmux capture takes ~50-100ms, state propagates to UI in ~200-300ms. 2s gives 4 polling cycles and is fast enough to feel instantaneous without excessive API load.

### 3. Detached Process Spawning (Non-blocking GSD command execution)

**Goal:** Start a GSD command (e.g., `/gsd:plan-phase`) in the project's tmux session without blocking the Express request.

**Pattern:**

```javascript
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

async function spawnGsdCommand(projectName, command, args = []) {
  const jobId = uuidv4();
  const project = config.projects.find(p => p.name === projectName);

  if (!project?.tmux_session) {
    throw new Error('No tmux session for project');
  }

  // Write to process_registry IMMEDIATELY (no blocking)
  const record = {
    id: jobId,
    command,
    args: JSON.stringify(args),
    pid: null, // Will be set after spawn
    started_at: new Date().toISOString(),
    run_id: null, // Link to autopilot_runs if applicable
  };
  stmts.insertProcessRegistry.run(record);

  // Spawn DETACHED from event loop
  const child = spawn(
    'tmux',
    ['send-keys', '-t', project.tmux_session, `${command} ${args.join(' ')}`, 'Enter'],
    {
      detached: true,      // Parent process doesn't wait for exit
      stdio: 'ignore',     // Don't inherit parent's stdio
      timeout: null        // No timeout — let it run to completion
    }
  );

  // Update registry with PID (non-blocking)
  if (child.pid) {
    stmts.updateProcessRegistry.run({ pid: child.pid, id: jobId });
  }

  // Return immediately with job ID
  return { jobId, pid: child.pid };
}
```

**Key features:**
- `detached: true` — child process becomes independent, Express returns immediately
- `stdio: 'ignore'` — don't capture output (logs go to tmux, not parent)
- UUID job ID for tracking in process_registry
- PID recorded for later cleanup/monitoring

### 4. Circuit Breaker (Halt autopilot after 3 consecutive phase failures)

**Purpose:** Prevent infinite retry loops when a phase consistently fails.

**Location:** New file `server/autopilot/CircuitBreaker.js`

**Implementation pattern:**
```javascript
class CircuitBreaker {
  constructor(runId, failureThreshold = 3) {
    this.runId = runId;
    this.failureThreshold = failureThreshold;
    this.failureCount = 0;
    this.lastFailedPhase = null;
  }

  recordFailure(phaseNum) {
    this.lastFailedPhase = phaseNum;

    // Get current failure count from autopilot_runs.failure_count
    const run = stmts.getAutopilotRun.get(this.runId);
    const newCount = (run.failure_count || 0) + 1;

    // Update database
    stmts.updateAutopilotRun.run({
      failure_count: newCount,
      last_failed_phase_num: phaseNum,
      id: this.runId
    });

    return newCount >= this.failureThreshold;
  }

  isOpen() {
    const run = stmts.getAutopilotRun.get(this.runId);
    return (run.failure_count || 0) >= this.failureThreshold;
  }
}
```

**Usage in autopilot loop:**
```javascript
const cb = new CircuitBreaker(runId);

for (const phase of phases) {
  if (cb.isOpen()) {
    console.log('Circuit breaker open — halting autopilot');
    updateRun(runId, { status: 'paused', pause_reason: 'circuit_breaker' });
    break;
  }

  try {
    executePhase(phase);
  } catch (err) {
    if (cb.recordFailure(phase.num)) {
      console.log(`Failed 3 times on phase ${phase.num} — opening circuit breaker`);
      updateRun(runId, { status: 'paused', pause_reason: 'circuit_breaker' });
      break;
    }
  }
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tracking active processes | Custom object maps with process refs | SQLite `process_registry` table | Objects lost on server restart; SQLite persists across crashes |
| Preventing infinite retries | Simple counter in memory | CircuitBreaker class with DB persistence | Memory counters reset; persistent approach survives process crashes |
| Terminal overlay refresh timing | Arbitrary delays (1s, 5s) | Empirically tested 2s polling loop | Too short = API spam; too long = feels unresponsive |
| Detached process spawning | `execFile(...) + callback` | `spawn(..., { detached: true })` | execFile waits for completion; spawn returns immediately |
| Schema migrations | Manual ALTER TABLE statements | Try/catch pattern + version markers in comments | Already established in db.js; 6+ migrations prove pattern stability |

**Key insight:** Autopilot requires persistent state across process boundaries. Everything goes in SQLite, nothing in memory.

---

## Common Pitfalls

### Pitfall 1: Claude Code Timer Pattern Too Narrow
**What goes wrong:** Regex `/·\s*↓\s*[\d.]+/` fails to match:
- Different timer formats from future Claude Code versions
- Cache indicators like "· ↓↓ 123 (cached)"
- Output indicators like "· ↓ 539 tokens · ↑ 22 tokens"

**Why it happens:** Single regex can't cover all Claude Code output variations; timer format may evolve.

**How to avoid:**
- Test pattern against current Claude Code output
- Document exact format being matched (e.g., "As of 2026-04-01, Claude Code shows: '(4m 19s · ↓ 539 tokens)'")
- Add comment in code with expected variations
- Plan for periodic pattern refinement

**Warning signs:**
- Terminal shows Claude is working (can see activity) but `detectSessionState()` returns `'waiting'`
- State badge on card doesn't match what's actually in the terminal

### Pitfall 2: Auto-Refresh Poll Interval Too Long
**What goes wrong:** Setting 5-10 second refresh interval makes the UI feel unresponsive when user closes terminal expecting instant state update.

**Why it happens:** Trying to minimize API load, forgetting that client-side polling is cheap for a single-user app.

**How to avoid:**
- Use 500ms polling interval for 2 seconds only (4 quick updates)
- Stop polling after 2 seconds (API saved: 3 extra calls)
- Measure actual state propagation time empirically in development

**Warning signs:**
- User closes terminal and waits 3+ seconds for card to update
- Client-side polling is disabled or set to > 3s intervals

### Pitfall 3: Process Registry Orphaned Records
**What goes wrong:** Spawned process dies unexpectedly, `process_registry` shows `exit_code: null` forever. No cleanup mechanism to distinguish "still running" from "crashed."

**Why it happens:** Forgot to add periodic cleanup task or exit event handlers.

**How to avoid:**
- In `spawnGsdCommand()`, attach child process `exit` event:
  ```javascript
  child.on('exit', (code) => {
    stmts.updateProcessRegistry.run({
      exit_code: code,
      ended_at: new Date().toISOString(),
      id: jobId
    });
  });
  ```
- Add startup cleanup: mark any process with `exit_code: null` and `started_at < now - 1 hour` as `exit_code: -1` (stale)
- Log entries with `exit_code: -1` for manual investigation

**Warning signs:**
- `process_registry` grows unbounded
- Old processes never show `exit_code`
- Unclear which spawned commands actually completed

### Pitfall 4: Circuit Breaker Triggered Permanently
**What goes wrong:** After 3 failures, `cb.isOpen()` always returns true, autopilot can't resume even after fixing the issue.

**Why it happens:** No reset mechanism; failure count persists indefinitely.

**How to avoid:**
- Add `pause_reason: 'circuit_breaker'` to `autopilot_runs` table
- When user clicks "Resume Autopilot" in UI, reset failure_count to 0
- Document that resume = circuit breaker reset
- In resumeAutopilot endpoint:
  ```javascript
  stmts.updateAutopilotRun.run({
    status: 'running',
    pause_reason: null,
    failure_count: 0,  // Reset
    id: runId
  });
  ```

**Warning signs:**
- Autopilot shows status: "paused (circuit breaker)" forever
- No UI control to manually resume or reset

### Pitfall 5: Migration Blocking on Constraint Errors
**What goes wrong:** Adding a new column with `NOT NULL` constraint on a table with existing data causes `PRAGMA foreign_keys = ON` to reject the migration.

**Why it happens:** SQLite enforces constraints strictly; can't add non-nullable column to table with rows.

**How to avoid:**
- Always use `DEFAULT` value when adding non-nullable columns:
  ```javascript
  db.prepare("ALTER TABLE autopilot_runs ADD COLUMN failure_count INTEGER DEFAULT 0").run();
  ```
- Or add as nullable first, then backfill:
  ```javascript
  db.prepare("ALTER TABLE autopilot_runs ADD COLUMN failure_count INTEGER").run();
  db.prepare("UPDATE autopilot_runs SET failure_count = 0 WHERE failure_count IS NULL").run();
  ```
- Test migration on existing database with data before committing

**Warning signs:**
- Schema alteration fails with "UNIQUE constraint failed" or "NOT NULL constraint"
- Migration succeeds on empty database but fails on production database

---

## Code Examples

### Pattern 1: Improved Waiting State Detection

```javascript
// Source: server/gsd/tmux.js (refined)
function detectSessionState(sessionName) {
  if (!sessionName) return 'archived';
  if (!isTmuxSessionActive(sessionName)) return 'paused';

  const output = capturePaneText(sessionName);
  if (output === null) return 'paused';

  // Claude Code activity indicator (priority 1)
  // Matches: "(4m 19s · ↓ 539 tokens" or "(30s · ↓" or "thinking)"
  // Handles variants: token indicators with/without counts, cache indicators
  const timerPatterns = [
    /\(\s*\d+[ms]+\s*·\s*↓/,        // "(4m 19s · ↓" or "(30s · ↓"
    /·\s*↓\s*[\d.]+/,               // "· ↓ 539" or "· ↓ 3.2"
    /thinking\)/,                   // "(thinking)"
  ];

  for (const pattern of timerPatterns) {
    if (pattern.test(output)) return 'working';
  }

  // Explicit waiting prompts (priority 2)
  const waitingPatterns = [
    />\s+\d+\./,
    /\[y\/n\]/i,
    /\(y\/n\)/i,
    /Press Enter/i,
    /Select an option/i,
    /^Choice\s+\(/mi,               // GSD "Choice (numbered options)"
  ];
  for (const pattern of waitingPatterns) {
    if (pattern.test(output)) return 'waiting';
  }

  // Default: session running but not actively processing
  return 'waiting';
}
```

### Pattern 2: Auto-Refresh on Terminal Close (Client)

```typescript
// Source: client/src/pages/GSD.tsx (in TerminalOverlay component)
function TerminalOverlay({ projectName, wsBase, onClose, initialSendValue }: TerminalOverlayProps) {
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleClose = useCallback(() => {
    // Trigger auto-refresh when overlay closes
    // Polls every 500ms for 2 seconds (4 updates), then stops
    setRefreshing(true);

    // Clear any existing refresh timers
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);

    // Poll /api/gsd/projects every 500ms
    refreshIntervalRef.current = setInterval(() => {
      api.gsd.projects()
        .then((data) => {
          setProjects(data.projects);
          setRateLimit(data.rateLimit ?? { active: false, resetAt: null });
        })
        .catch(() => {}); // Silent fail; polling will retry
    }, 500);

    // Stop after 2 seconds
    refreshTimeoutRef.current = setTimeout(() => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      setRefreshing(false);
    }, 2000);

    // Now actually close
    onCloseRef.current();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  return (
    // ... terminal overlay JSX
  );
}
```

### Pattern 3: Detached Process Spawning

```javascript
// Source: server/autopilot/processSpawner.js (new file)
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { db, stmts } = require('../db');

function spawnGsdCommand(projectName, gsdCommand, options = {}) {
  const {
    args = [],
    runId = null,
    timeout = null
  } = options;

  const jobId = uuidv4();
  const config = JSON.parse(require('fs').readFileSync(
    process.env.GSD_PROJECTS_PATH || './gsd-projects.json',
    'utf8'
  ));
  const project = config.projects.find(p => p.name === projectName);

  if (!project?.tmux_session) {
    throw new Error(`Project ${projectName} has no tmux session configured`);
  }

  // Record in process_registry BEFORE spawning
  const startedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO process_registry (
      id, run_id, command, args, started_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(jobId, runId, gsdCommand, JSON.stringify(args), startedAt);

  // Build tmux command: send-keys to inject the GSD command
  const tmuxCmd = 'tmux';
  const tmuxArgs = ['send-keys', '-t', project.tmux_session, `${gsdCommand} ${args.join(' ')}`, 'Enter'];

  // Spawn DETACHED from event loop
  const child = spawn(tmuxCmd, tmuxArgs, {
    detached: true,      // Don't wait for process
    stdio: 'ignore',     // No stdio inheritance
    timeout: timeout,    // Optional timeout
    cwd: project.root    // Run in project directory
  });

  // Record PID (non-blocking)
  if (child.pid) {
    db.prepare('UPDATE process_registry SET pid = ? WHERE id = ?')
      .run(child.pid, jobId);
  }

  // Attach exit handler to update registry
  child.on('exit', (code, signal) => {
    const endedAt = new Date().toISOString();
    db.prepare(`
      UPDATE process_registry
      SET exit_code = ?, ended_at = ?
      WHERE id = ?
    `).run(code ?? (signal ? -1 : null), endedAt, jobId);
  });

  // Don't unref() — let process complete independently
  // (detached: true already made it independent)

  return {
    jobId,
    pid: child.pid,
    started_at: startedAt
  };
}

module.exports = { spawnGsdCommand };
```

### Pattern 4: CircuitBreaker Class

```javascript
// Source: server/autopilot/CircuitBreaker.js (new file)
const { db } = require('../db');

class CircuitBreaker {
  constructor(runId, failureThreshold = 3) {
    this.runId = runId;
    this.failureThreshold = failureThreshold;
  }

  /**
   * Record a failure for a phase. Returns true if circuit should open.
   */
  recordFailure(phaseNum) {
    const run = db.prepare('SELECT * FROM autopilot_runs WHERE id = ?')
      .get(this.runId);

    if (!run) {
      throw new Error(`Autopilot run ${this.runId} not found`);
    }

    const newCount = (run.failure_count || 0) + 1;

    db.prepare(`
      UPDATE autopilot_runs
      SET failure_count = ?, last_failed_phase_num = ?
      WHERE id = ?
    `).run(newCount, phaseNum, this.runId);

    return newCount >= this.failureThreshold;
  }

  /**
   * Check if circuit is open (too many failures).
   */
  isOpen() {
    const run = db.prepare('SELECT failure_count FROM autopilot_runs WHERE id = ?')
      .get(this.runId);
    return run && (run.failure_count || 0) >= this.failureThreshold;
  }

  /**
   * Reset failure counter (when user resumes).
   */
  reset() {
    db.prepare(`
      UPDATE autopilot_runs
      SET failure_count = 0, pause_reason = NULL
      WHERE id = ?
    `).run(this.runId);
  }
}

module.exports = { CircuitBreaker };
```

### Pattern 5: SQLite Schema Migrations

```javascript
// Source: server/db.js (append to existing migration section)

// Migration: Add autopilot tables (Phase 24)
try {
  db.prepare("SELECT 1 FROM autopilot_runs LIMIT 1").get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS autopilot_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'paused', 'completed', 'failed')),
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_failed_phase_num INTEGER,
      pause_reason TEXT,
      FOREIGN KEY (project_id) REFERENCES sessions(cwd)
    );

    CREATE TABLE IF NOT EXISTS process_registry (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      command TEXT NOT NULL,
      args TEXT,
      pid INTEGER,
      exit_code INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      stdout TEXT,
      stderr TEXT,
      FOREIGN KEY (run_id) REFERENCES autopilot_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS claude_api_usage (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES autopilot_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS external_service_costs (
      id TEXT PRIMARY KEY,
      service TEXT NOT NULL,
      cost_period TEXT DEFAULT 'monthly',
      cost_usd REAL DEFAULT 0,
      checked_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_autopilot_runs_project ON autopilot_runs(project_id);
    CREATE INDEX IF NOT EXISTS idx_autopilot_runs_status ON autopilot_runs(status);
    CREATE INDEX IF NOT EXISTS idx_process_registry_run ON process_registry(run_id);
    CREATE INDEX IF NOT EXISTS idx_process_registry_pid ON process_registry(pid);
    CREATE INDEX IF NOT EXISTS idx_claude_api_usage_run ON claude_api_usage(run_id);
    CREATE INDEX IF NOT EXISTS idx_service_costs_service ON external_service_costs(service);
  `);
}

// Cleanup: mark stale process registry entries as exited
// Run at startup to mark any orphaned processes (started > 1 hour ago with no exit code)
db.prepare(`
  UPDATE process_registry
  SET exit_code = -1, ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE exit_code IS NULL
    AND started_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')
`).run();
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Blocking process execution (`execFileSync`) | Detached spawning (`spawn(..., { detached: true })`) | Not yet implemented; Phase 24 introduces it | Autopilot can start 10+ commands without API blocking; user experiences instant response |
| Manual session state polling (30s interval) | Auto-refresh on terminal close (2s burst) | Phase 24 implements | Perceived responsiveness improves; terminal state updates feel instant |
| In-memory process tracking | SQLite `process_registry` table | Phase 24 introduces | Process tracking survives server crashes; audit trail persists |
| Simple counter for retries | Persistent CircuitBreaker with failure_count in DB | Phase 24 introduces | Safety guarantees survive process boundaries |

**Deprecated/outdated:**
- None — waiting state detection pattern is still current (2026-04-01)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `--test` module (no external framework) |
| Config file | None — tests are standalone .test.js files |
| Quick run command | `npm run test:server` |
| Full suite command | `npm test` (includes both server and client tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | `detectSessionState()` returns `'working'` when Claude Code timer visible in pane output | unit | `npm run test:server -- --grep "waiting.accuracy"` | ❌ Wave 0 |
| UX-01 | `detectSessionState()` returns `'waiting'` when session active but no timer | unit | Same as above | ❌ Wave 0 |
| UX-02 | Terminal close triggers polling loop within 500ms | integration | `npm run test:client -- --grep "terminal.refresh"` | ❌ Wave 0 |
| UX-02 | State updates complete within 2 seconds of close | integration | Same as above | ❌ Wave 0 |
| AUTO-05 | `CircuitBreaker.recordFailure()` increments counter persistently | unit | `npm run test:server -- --grep "circuit.breaker"` | ❌ Wave 0 |
| AUTO-05 | `CircuitBreaker.isOpen()` returns true after 3 failures | unit | Same as above | ❌ Wave 0 |
| AUTO-05 | Autopilot halts execution when circuit opens | integration | `npm run test:server -- --grep "autopilot.circuit"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:server` (all server tests)
- **Per wave merge:** `npm test` (server + client)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `server/__tests__/tmux.test.js` — covers UX-01 (waiting state detection patterns)
- [ ] `server/__tests__/circuitBreaker.test.js` — covers AUTO-05 (failure counting and circuit opening)
- [ ] `server/__tests__/processSpawner.test.js` — covers detached process spawning and registry tracking
- [ ] `client/src/components/__tests__/TerminalOverlay.test.tsx` — covers UX-02 (auto-refresh on close)
- [ ] `server/db.js` — add prepared statements for autopilot_runs, process_registry, claude_api_usage, external_service_costs (no new test file needed, integration tested in existing db tests)

---

## Sources

### Primary (HIGH confidence)
- **Context7:** Not available; this domain is application-specific code
- **Official docs:**
  - Node.js `child_process` API — https://nodejs.org/api/child_process.html (detached spawning)
  - SQLite ALTER TABLE — https://www.sqlite.org/lang_altertable.html (migrations)
  - xterm.js Terminal API — https://xtermjs.org/docs/api/terminal/terminal/ (terminal state)

### Secondary (MEDIUM confidence)
- Existing codebase patterns:
  - `/data/home/gsddashboard/server/gsd/tmux.js` — current `detectSessionState()` implementation
  - `/data/home/gsddashboard/server/db.js` — established migration pattern (lines 164-236)
  - `/data/home/gsddashboard/client/src/pages/GSD.tsx` — 30-second polling pattern (line 776)
  - `/data/home/gsddashboard/server/routes/gsd.js` — tmux interaction patterns (send-keys, load-buffer)

### Tertiary (LOW confidence)
- None — research is based on official docs and existing codebase patterns

---

## Metadata

**Confidence breakdown:**
- Standard Stack: **HIGH** — Standard patterns documented in official Node.js/SQLite docs
- Architecture Patterns: **HIGH** — Patterns extracted from existing code (tmux.js, db.js migrations already proven)
- Pitfalls: **MEDIUM** — Derived from SQL best practices and Node.js process patterns; some edge cases unknown until implementation
- Test coverage: **MEDIUM** — Framework identified, but specific test cases require implementation exploration

**Research date:** 2026-04-01
**Valid until:** 2026-04-08 (one week; stable domain with no breaking changes expected)

---

## Open Questions

1. **Claude Code timer pattern edge cases**
   - What happens when Claude is in a nested GSD subagent call? Does the timer show?
   - How does the pattern behave with `thinking` blocks — does it show the timer or just "(thinking)"?
   - Recommendation: Capture real Claude Code output from Phase 25+ and test pattern against it

2. **Process registry cleanup strategy**
   - Should we proactively poll `process_registry` for stale processes, or wait for crash investigation?
   - How long should we keep old process records (1 day? 7 days? forever)?
   - Recommendation: Start conservative (keep forever), add retention policy in Phase 26 cost tracking

3. **Circuit breaker pause vs. failure state**
   - When circuit opens, should autopilot_runs.status be `'paused'` or `'failed'`?
   - What's the user experience difference? Can user resume a paused run?
   - Recommendation: Status = `'paused'`, pause_reason = `'circuit_breaker'`, user can manually reset via "Resume" button

4. **Cross-project failure counting**
   - If two projects both hit Phase 5 and fail 3x each, do they interfere?
   - Each autopilot_runs record is independent, so no interference expected.
   - Recommendation: Verify that CircuitBreaker is instantiated per-run, not globally

---

## Next Steps for Planner

1. **Task 24-01 (UX-01, UX-02):** Refine waiting state detection and implement terminal close refresh
   - Improve Claude Code timer regex (test against real output)
   - Add auto-refresh polling loop in TerminalOverlay
   - Verify 2-second refresh window is sufficient empirically

2. **Task 24-02 (AUTO-05, Infrastructure):** Build safety database schema and circuit breaker
   - Create four new SQLite tables with migrations
   - Implement `CircuitBreaker` class with persistent state
   - Implement `spawnGsdCommand()` for detached process launching
   - Create `ProcessRegistry` for tracking jobs

3. **Testing:** Add test infrastructure for all new patterns
   - Unit tests for `detectSessionState()` with edge cases
   - Unit tests for `CircuitBreaker` failure counting
   - Integration tests for auto-refresh timing
   - Integration tests for process spawning and registry tracking
