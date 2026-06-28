# Phase 80: Claude-Mem Cross-Project Memory — Research

**Researched:** 2026-06-28
**Domain:** Cross-project persistent memory for Claude Code (claude-mem v13.x, Bun runtime, SQLite + ChromaDB)
**Confidence:** HIGH

## Summary

Claude-Mem is a proven open-source system that captures tool observations during every Claude Code session, compresses them with a small LLM (Haiku by default), and stores them in SQLite + Chroma vector DB. Future sessions auto-inject relevant context via the SessionStart hook, so knowledge crosses session and project boundaries. The installed plugin in `~/.claude/plugins/marketplaces/thedotmack/` is the single source of truth; it ships a `.mcp.json` at the plugin root that auto-registers the `mcp-search` server for every session.

The key architectural insight for this phase: **the plugin is installed once per user (the `claude` OS user), and the worker (`worker-service.cjs`) runs as a managed Bun process on port derived from UID**. Since this VPS has only the `claude` user running Claude Code sessions, all sessions already share the same worker and same SQLite DB by default. The only deliberate configuration needed is to pin the data directory to `/home/services/.claude-mem/` and pin the worker port, so the path is explicit and stable across PM2 restarts.

The worker is managed by a custom Bun-based `ProcessManager` (migrated from PM2 in claude-mem v7.1.0). However, since the SessionStart hook calls `worker-service.cjs start` on every session start, the worker self-bootstraps reliably without needing PM2 at all. For production persistence, wrapping it in PM2 is still recommended — PM2 auto-restarts on crash, and the SessionStart hook gracefully handles an already-running worker.

Primary recommendation: Install claude-mem once via `npx claude-mem install`, configure `CLAUDE_MEM_DATA_DIR=/home/services/.claude-mem` and a fixed port in the settings, wrap the worker in PM2 for auto-restart, and verify cross-project recall by checking that a PostToolUse observation from Project A surfaces in a Project B SessionStart context injection.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Worker process (Bun) | VPS / OS-level service | PM2 | Long-running background HTTP API, not tied to any project |
| SQLite observations store | Shared filesystem | `/home/services/.claude-mem/` | Single DB, all sessions write to same store |
| Chroma vector DB | Shared filesystem | Python (uv-managed) | Semantic search index co-located with SQLite |
| SessionStart hook (context injection) | Client (each Claude Code session) | Plugin | Auto-fires on every `startup`/`clear`/`compact` event, no per-project setup needed |
| PostToolUse hook (observation capture) | Client (each Claude Code session) | Plugin | Every tool call across all projects feeds the shared DB |
| MCP search tools | Plugin (auto-registered) | `.mcp.json` at plugin root | Available in every session without per-project `.mcp.json` edits |

## User Constraints (from REQUIREMENTS.md MEM category)

| ID | Requirement | Phase |
|---|---|---|
| MEM-01 | claude-mem worker runs as a VPS-level PM2 service with a shared SQLite + Chroma store, not per-project | 80 |
| MEM-02 | All active Claude Code sessions are configured to use the shared store via SessionStart hook | 80 |
| MEM-03 | Cross-project recall verified: a solution from one project surfaces semantically in another without manual CLAUDE.md updates | 80 |
| MEM-04 | Resource footprint documented: RAM, CPU, and disk growth measured and within VPS budget | 80 |

No CONTEXT.md exists for this phase. Locked decisions from CLAUDE.md global instructions:
- All secrets live in `/home/services/.env.production` — never hardcode API keys
- The `claude` user is hard-capped at 2.4GB RAM via cgroup; current usage shows ~3.7GB total system with ~730MB free; ~930MB available after cache
- `OPENROUTER_API_KEY` is available in the environment for free-tier LLM compression (claude-mem's summarization calls)
- Bun is NOT currently installed on this VPS (auto-installed by claude-mem installer, but needs a budget check)

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| claude-mem | 13.8.1 (latest) | Memory compression, persistence, recall | Only purpose-built cross-session memory for Claude Code; Atlassian-maintained equivalent doesn't exist for this use case |
| Bun | 1.3.14 (latest auto-installed) | Worker runtime (lighter than Node for this workload) | claude-mem v7.1+ uses Bun ProcessManager; native `bun:sqlite` driver replaces better-sqlite3 |
| ChromaDB (via chromadb npm) | bundled with claude-mem | Vector index for semantic search | Standard vector DB for LLM embeddings; hybrid search with SQLite FTS5 keyword fallback |
| uv | 0.11.25 (already installed) | Python package manager for Chroma | Auto-detected by installer; no action needed |

### Configuration

| Setting | Value | Why |
|---|---|---|
| `CLAUDE_MEM_DATA_DIR` | `/home/services/.claude-mem` | Explicit VPS-level shared path (not default `~/.claude-mem`) |
| `CLAUDE_MEM_WORKER_PORT` | `37700` | Fixed port avoids UID-formula collision; default formula gives 37700 for UID 1000 anyway |
| `CLAUDE_MEM_PROVIDER` | `openrouter` | Uses free OpenRouter models (no Anthropic API cost for compression) |
| `CLAUDE_MEM_OPENROUTER_API_KEY` | `OPENROUTER_API_KEY` from env | Free tier; avoid Anthropic subscription use for summarization |
| `CLAUDE_MEM_OPENROUTER_MODEL` | `google/gemini-2.0-flash-exp:free` or `xiaomi/mimo-v2-flash:free` | Zero-cost; verified free model |
| `CLAUDE_MEM_CONTEXT_OBSERVATIONS` | `50` (default) | Range 1-200; 50 balances recall vs token injection cost |
| `CLAUDE_MEM_MODEL` | N/A when using OpenRouter | Provider setting overrides this |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| OpenRouter free tier | `CLAUDE_MEM_PROVIDER=gemini` (free Gemini tier) | Gemini free tier has lower rate limits; OpenRouter is already set up in this VPS (bridge exists) |
| PM2-wrapped worker | Raw Systemd `Restart=always` service | PM2 is the standard on this VPS; no added complexity |
| Default `~/.claude-mem` data dir | Explicit `/home/services/.claude-mem` | Global instructions say project data goes on the volume; same logic applies to shared memory store |
| Chroma vector DB | PostgreSQL pgvector | pgvector not installed; Chroma is bundled, zero-setup |

**Installation (verified):**
```bash
# Auto-installs bun + uv if missing, registers plugin, starts worker
npx claude-mem install

# Configure shared data dir + free provider
mkdir -p /home/services/.claude-mem
cat > /home/services/.claude-mem/settings.json << 'EOF'
{
  "CLAUDE_MEM_DATA_DIR": "/home/services/.claude-mem",
  "CLAUDE_MEM_WORKER_PORT": "37700",
  "CLAUDE_MEM_PROVIDER": "openrouter",
  "CLAUDE_MEM_OPENROUTER_API_KEY": "<from .env.production OPENROUTER_API_KEY>",
  "CLAUDE_MEM_OPENROUTER_MODEL": "google/gemini-2.0-flash-exp:free",
  "CLAUDE_MEM_CONTEXT_OBSERVATIONS": "50"
}
EOF
```

**Version verification:**
```
npm view claude-mem version  →  13.8.1
npm view bun version         →  1.3.14
claude-mem package published →  active (v13.8.1 is current as of fetch)
```

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VPS (Hetzner, claude user)                   │
│                                                                     │
│  ┌─────────────┐    SessionStart hook    ┌────────────────────────┐ │
│  │ Claude Code  │ ──────────────────────→ │  Plugin: claude-mem   │ │
│  │ Session A    │    PostToolUse hook     │  (installed once in   │ │
│  │ (Project X)  │ ──────────────────────→ │   ~/.claude/plugins/) │ │
│  └─────────────┘                          └──────────┬─────────────┘ │
│                                                      │              │
│  ┌─────────────┐    SessionStart hook                │ context     │
│  │ Claude Code  │ ←──────────────────────────────── │ injection   │
│  │ Session B    │                                   │             │
│  │ (Project Y)  │                                   ▼             │
│  └─────────────┘                          ┌────────────────────────┐ │
│                                           │  worker-service.cjs    │ │
│                                           │  (Bun, port 37700)    │ │
│                                           │  managed by PM2:      │ │
│                                           │  claude-mem-worker     │ │
│                                           └──────────┬─────────────┘ │
│                                                      │              │
│                                                      ▼              │
│                                           ┌────────────────────────┐ │
│                                           │  /home/services/.claude-mem/      │
│                                           │  ├── claude-mem.db     │ │
│                                           │  ├── settings.json     │ │
│                                           │  ├── .worker.pid       │ │
│                                           │  ├── chroma/           │ │
│                                           │  └── logs/             │ │
│                                           └────────────────────────┘ │
│                                                      ▲              │
│                                                      │ MCP tools    │
│                                           ┌──────────┴────────────┐ │
│                                           │  mcp-search (stdio)   │ │
│                                           │  search()             │ │
│                                           │  timeline()           │ │
│                                           │  get_observations()   │ │
│                                           │  [auto-registered     │ │
│                                           │   via plugin .mcp.json]│ │
│                                           └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Installation Path

```bash
/home/services/.claude-mem/          # Shared data store (explicit path)
/home/claude/.claude/plugins/marketplaces/thedotmack/claude-mem/  # Plugin (once per user)
/home/claude/.claude/settings.json   # Already has hooks config (SessionStart etc.)
/home/services/gsddashboard/.mcp.json # Project-level MCP (gsd-workflow, gsd-browser) — NOT where mcp-search goes
```

### Key Behaviors

**SessionStart hook (auto-injects context):**
```json
{
  "matcher": "startup|clear|compact",
  "hooks": [
    {
      "type": "command",
      "command": "bun ${CLAUDE_PLUGIN_ROOT}/scripts/worker-service.cjs start",
      "timeout": 60
    },
    {
      "type": "command",
      "command": "bun ${CLAUDE_PLUGIN_ROOT}/scripts/context-hook.js",
      "timeout": 60
    }
  ]
}
```
The first hook starts the worker if not already running (idempotent — safe to call on every session start). The second hook queries the worker for relevant past observations and injects them into the current session's system prompt context.

**PostToolUse hook (captures observations):**
```json
{
  "matcher": "*",
  "hooks": [{
    "type": "command",
    "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/save-hook.js",
    "timeout": 120
  }]
}
```
Every tool result (Bash output, file writes, etc.) is sent to the worker asynchronously. The worker compresses it into an observation using the configured LLM provider.

**MCP tools (auto-registered by plugin `.mcp.json`):**
- `search(query, type?, limit?)` — Compact index (~50-100 tokens/result)
- `timeline(anchor, depth_before, depth_after)` — Chronological context
- `get_observations(ids[], orderBy?, limit?, project?)` — Full details by ID (~500-1000 tokens/result)

The 3-layer workflow: search → filter IDs → get_observations. This is token-efficient — only fetch full details for the 3-5 relevant hits, not the entire memory store.

### Settings Precedence (critical to get right)

Settings are loaded from (in order):
1. Environment variables (highest priority)
2. `~/.claude-mem/settings.json`
3. Plugin defaults

`CLAUDE_MEM_DATA_DIR` and `CLAUDE_MEM_WORKER_PORT` should be set in the settings file AND can be reinforced as environment variables in the PM2 ecosystem config to survive shell changes.

### Anti-Patterns to Avoid

- **Setting `.mcp.json` per-project for mcp-search**: The plugin already registers the MCP server automatically via its root `.mcp.json`. Adding it per-project will cause duplicate registration errors.
- **Running without pinning the data dir**: If a session fires from a non-standard working directory, some scripts resolve paths via `$HOME`; explicit `CLAUDE_MEM_DATA_DIR` removes ambiguity.
- **Using `CLAUDE_MEM_PROVIDER=claude` with the existing OpenRouter bridge**: This VPS routes Claude Code through OpenRouter via `ANTHROPIC_BASE_URL`, but the OpenRouter bridge does not expose the standard Anthropic Messages API shape that claude-mem's Claude provider expects. Use `CLAUDE_MEM_PROVIDER=openrouter` to be consistent with the routing setup.
- **Running the worker without PM2**: If Bun's ProcessManager crashes silently (low risk, but possible under memory pressure), no auto-restart happens. PM2 is the belt-and-suspenders approach; the SessionStart hook is the primary auto-start mechanism.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Cross-project context injection | Custom CLAUDE.md rewrite logic | claude-mem SessionStart hook | Handles semantic relevance, token budgeting, dedup, and progressive disclosure already |
| Memory compression/observation extraction | Custom LLM summarization pipeline | claude-mem's built-in `summary-hook.js` + `save-hook.js` | Already handles the 5 hook lifecycle events, type classification (bugfix, feature, discovery, decision), and concept tagging |
| Semantic memory search over past sessions | Custom Chroma/pgvector setup | claude-mem's `search` MCP tool | Backend already does hybrid keyword+embedding search; tools are already wired |
| MCP tool registration | Manually writing `.mcp.json` for every new project | Plugin's root `.mcp.json` auto-registration | Plugin MCP servers are managed through plugin installation, not `/mcp` commands; they just work |

## Runtime State Inventory

**Step 2.6: SKIPPED** — this phase installs a new service from scratch; no existing runtime state to migrate.

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | None — new install | Data dir at `/home/services/.claude-mem/` starts empty; no migration needed |
| Live service config | None — claude-mem not currently installed | Fresh PM2 registration |
| OS-registered state | None | Bun will be auto-installed to `~/.bun/` by the installer |
| Secrets/env vars | `OPENROUTER_API_KEY` available in `/home/services/.env.production` and in current shell env | Import into `settings.json`; never commit to git |
| Build artifacts | None | `npx claude-mem install` builds `mcp-server.cjs` and other scripts into the plugin dir |

## Common Pitfalls

### Pitfall 1: Bun Not on PATH After Install
**What goes wrong:** The claude-mem installer installs Bun to `~/.bun/bin/bun`, which is not on the default systemd/PM2 PATH. Hooks and PM2 workers fail with `bun: command not found`.
**Why it happens:** CLAUDE.md and interactive shells source `.bashrc` which adds `~/.local/bin` and `~/.bun/bin`, but PM2 daemon_jobs and systemd services do not.
**How to avoid:** Set `PATH` explicitly in the PM2 ecosystem config:
```js
env: { PATH: '/home/claude/.bun/bin:/usr/local/bin:/usr/bin:/bin' }
```
Or use the absolute bun path in the PM2 `script` field directly.

### Pitfall 2: Worker Port Collision on Multi-User VPS
**What goes wrong:** If another user ever runs Claude Code on this VPS, the default formula `37700 + (uid % 100)` gives them a different port and a separate DB — defeating the shared-memory goal.
**Why it happens:** Port formula is by-design per-UID; the `claude` user always gets 37700.
**How to avoid:** Since only the `claude` user runs sessions here, this is not a current risk. Explicit `CLAUDE_MEM_WORKER_PORT=37700` in settings makes the intent clear. **Future-proof:** if a second user is added, set the same port and same `CLAUDE_MEM_DATA_DIR` for both (SQLite handles concurrent writes via WAL mode).

### Pitfall 3: OpenRouter Free Model Rate Limiting Under Burst
**What goes wrong:** claude-mem can fire multiple summarization calls in quick succession (Stop hook fires on every Claude response completion); free OpenRouter models have RPM limits.
**Why it happens:** Each PostToolUse event that generates an observation triggers a compression call. A busy session can generate 20+ observations in 2 minutes.
**How to avoid:** Start with free model; if rate-limit errors appear in worker logs, switch to Gemini free tier (`CLAUDE_MEM_GEMINI_API_KEY`) as a fallback provider, or set `CLAUDE_MEM_SKIP_TOOLS` to reduce observation volume. Monitor `~/.claude-mem/logs/worker-error.log` in the first 48 hours.

### Pitfall 4: SessionStart Hook Latency
**What goes wrong:** The SessionStart hook has a 60-second timeout. On a cold worker start (after a VPS restart), Bun takes 2-3 seconds to boot, context query takes 1-2 seconds. Multiple concurrent sessions starting at once can still hit rate limits.
**Why it happens:** Worker is started fresh on first session start after boot; the SessionStart hook is blocking for the context injection call.
**How to avoid:** PM2 ensures the worker is already running when any session starts — the hook's `worker-service.cjs start` call is a no-op if the worker is already up. This is the primary argument for the PM2 wrapper. Cold-start latency is only an issue on the very first session after VPS boot.

### Pitfall 5: SQLite WAL Growth Under Concurrent Writes
**What goes wrong:** Multiple Claude Code sessions writing observations simultaneously can grow the WAL file (Write-Ahead Log) beyond the default auto-checkpoint threshold.
**Why it happens:** SQLite WAL mode (default for bun:sqlite) keeps writes in a `-wal` file until a checkpoint runs. Concurrent writers from 5-40 sessions can grow this file.
**How to avoid:** Checkpoint runs automatically on connection close. Monitor `claude-mem.db-wal` file size after first week of heavy use. If it grows beyond 50MB, set `PRAGMA wal_autocheckpoint=1000` via worker settings. This is a low-probability issue under current VPS loads.

### Pitfall 6: Memory Budget — Worker + Chroma + Python uv
**What goes wrong:** The worker (Bun + SQLite + Python Chroma process) can consume more RAM than the 200-300MB estimate if Chroma's embedding model is loaded into memory.
**Why it happens:** Chroma loads a sentence-transformer embedding model (~80-120MB) into the Python process. Bun runtime adds 60-100MB. Python runtime adds 30-50MB.
**How to avoid:** Total footprint is expected at 200-300MB as stated. Current VPS available RAM is ~730MB (free) / ~930MB (with cache). The worker fits comfortably. If memory is tight, Chroma can be disabled (system degrades to SQLite FTS5 keyword-only search, which still works for exact-match recall).

## Code Examples

### PM2 Ecosystem Config (`ecosystem.config.js`)

```js
// Run from the claude-mem plugin directory
const path = require('path');

const PLUGIN_SCRIPTS = path.join(
  process.env.HOME,
  '.claude/plugins/marketplaces/thedotmack/claude-mem/plugin/scripts'
);

module.exports = {
  apps: [{
    name: 'claude-mem-worker',
    script: path.join(PLUGIN_SCRIPTS, 'worker-service.cjs'),
    args: 'start',
    interpreter: path.join(process.env.HOME, '.bun/bin/bun'),
    cwd: '/home/services/.claude-mem',
    env_file: '/home/services/.env.production',  // loads OPENROUTER_API_KEY
    env: {
      PATH: `${path.join(process.env.HOME, '.bun/bin')}:/usr/local/bin:/usr/bin:/bin`,
      CLAUDE_MEM_DATA_DIR: '/home/services/.claude-mem',
      CLAUDE_MEM_WORKER_PORT: '37700',
    },
    max_memory_restart: '512M',
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: '10s',
  }],
};
```

### settings.json — Shared Store Configuration

```json
{
  "CLAUDE_MEM_DATA_DIR": "/home/services/.claude-mem",
  "CLAUDE_MEM_WORKER_PORT": "37700",
  "CLAUDE_MEM_PROVIDER": "openrouter",
  "CLAUDE_MEM_OPENROUTER_API_KEY": "<OPENROUTER_API_KEY>",
  "CLAUDE_MEM_OPENROUTER_MODEL": "google/gemini-2.0-flash-exp:free",
  "CLAUDE_MEM_CONTEXT_OBSERVATIONS": "50",
  "CLAUDE_MEM_LOG_LEVEL": "INFO"
}
```

### Verification Commands

```bash
# Worker running?
curl -s http://127.0.0.1:37700/api/health | jq .
# Expected: {"status":"ok","port":37700,"memory":{...},"uptime":<seconds>}

# Observations being captured? (after using Claude Code for 5 min)
curl -s "http://127.0.0.1:37700/v1/observations?limit=5" | jq '.observations | length'

# MCP tools available in a session? (run inside Claude Code)
# /mcp → should show "mcp-search" with search, timeline, get_observations

# Cross-project recall check:
# 1. In Project A's session: make a distinctive change (write a file with a unique string)
# 2. In Project B's session: search("unique string from Project A")
# 3. Expected: the observation from Project A surfaces in Project B's results
```

### MCP Tool Usage (3-layer recall pattern)

```typescript
// Layer 1: Search (~50-100 tokens per result)
search(query="WebSocket reconnection with exponential backoff", type="pattern", limit=10)
// → [{id: 123, title: "...", project: "gsddashboard", date: "..."}, ...]

// Layer 2: Timeline context (optional)
timeline(anchor=123, depth_before=2, depth_after=2)
// → [{id: 119, ...}, {id: 123, ...}, {id: 128, ...}]

// Layer 3: Full details (~500-1000 tokens per result, only fetch what you need)
get_observations(ids=[123])
// → [{id: 123, title: "...", narrative: "...", facts: [...], concepts: [...]}]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Per-project LEARNINGS.md (Phase 78) | Cross-project semantic recall via claude-mem | Phase 80 | LEARNINGS.md is manual per-project; claude-mem is automatic, programmatic, and cross-project |
| Manual CLAUDE.md cross-referencing | SessionStart hook auto-injection of relevant context | Phase 80 | Eliminates need for manual context sharing between projects |
| PM2 process management for worker | Bun-based `ProcessManager` (v7.1.0+) | 2025 (claude-mem v7.1.0) | Worker no longer depends on PM2, but PM2 still recommended for auto-restart on this VPS |
| better-sqlite3 (native module) | bun:sqlite (built-in) | 2025 (claude-mem v7.1.0) | No compiled native deps; fewer install failures |

**License note:** claude-mem is MIT-licensed (Alex Newman / @thedotmack). Apache 2.0 tag on some docs is outdated. [VERIFIED: npm registry `license` field]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | OpenRouter free model `google/gemini-2.0-flash-exp:free` remains available | Standard Stack | If model is retired, switch to `xiaomi/mimo-v2-flash:free` or Gemini free tier |
| A2 | `ANTHROPIC_BASE_URL=http://localhost:4820/openrouter-bridge` does not expose Anthropic Messages API shape natively required by claude-mem's `CLAUDE_MEM_PROVIDER=claude` mode | Pitfall 3 | HIGH: using `claude` provider would silently fail or route through the bridge unexpectedly. Using `openrouter` provider directly with the OpenRouter key avoids this entirely |
| A3 | Bun will install cleanly via the auto-installer on this VPS (aarch64 architecture) | Standard Stack | If Bun doesn't support this exact platform, fall back to `npm install -g bun` or Node compatibility mode |
| A4 | The SessionStart hook auto-start behavior is sufficient for the first session after VPS boot | Pitfall 4 | The first session after boot may have 3-5s cold-start latency; PM2 eliminates this for subsequent sessions |

## Open Questions

1. **Is the `ANTHROPIC_BASE_URL` bridge transparent claude-mem's HTTP calls?**
   - What we know: The bridge is configured for the main Claude Code sessions' messages API, but claude-mem has its own HTTP client for summarization calls
   - What's unclear: Whether claude-mem's internal HTTP client picks up the `ANTHROPIC_BASE_URL` env var
   - Recommendation: Use `CLAUDE_MEM_PROVIDER=openrouter` explicitly. This bypasses the Anthropic API path entirely and uses the OpenRouter key directly. This sidesteps the question.

2. **What is the actual RAM footprint of the Python Chroma process on this VPS?**
   - What we know: Phase description estimates 200-300MB total; Chroma's embedding model is the wildcard
   - What's unclear: Whether the embedding model loads fully in memory or memory-mapped
   - Recommendation: Measure actual RSS via `ps aux | grep chroma` after install. If >250MB alone, disable Chroma and fall back to SQLite FTS5 (`CLAUDE_MEM_VECTOR_SEARCH_ENABLED=false` if supported, or skip `uv` install).

3. **Does the existing `gsd-session-state.sh` SessionStart hook conflict with the claude-mem SessionStart hook?**
   - What we know: Multiple hooks in the same lifecycle event run in array order — they are additive, not exclusive
   - What's unclear: Whether there is a timeout budget issue (each hook has 60s timeout, but GSD hooks add up)
   - Recommendation: The claude-mem SessionStart hook adds ~2-3s latency on cold start; existing GDS hooks have separate concerns (session state, check-update). No conflict expected, but verify total SessionStart latency is <60s during Plan 01 test.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js 20+ | claude-mem install scripts | yes | v22.22.3 | — |
| Bun 1.0+ | worker runtime | no (auto-installed) | 1.3.14 (installer will fetch) | `npm install -g bun` |
| uv | ChromaDB Python deps | yes | 0.11.25 | — |
| Python 3.12 | ChromaDB | yes | 3.12.3 | — |
| OpenRouter API key | Free-tier compression LLM | yes | — | Gemini free tier |
| RAM (available) | Worker + Chroma | marginal | ~930MB available after cache | Disable Chroma if tight |
| Disk (/home/services) | Shared data dir | yes | 6.8GB free, 82% used | — |
| PM2 | Worker process management | yes | running | Systemd unit |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- Bun: Not installed, but auto-installer handles it; manual fallback exists

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Jest (server) + Vitest (client) |
| Config file | `package.json` scripts |
| Quick run command | `npm run test:server` |
| Full suite command | `npm run build && npm run test:server && npm run test:client` |

Note: This phase is infrastructure-only. No dashboard code changes are required — it installs a VPS-level service. The validation approach is **operational verification** (worker up, hooks firing, cross-project recall working), not unit tests.

### Phase Requirements → Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| MEM-01 | Worker runs as VPS-level PM2 service, shared data dir | operational | `pm2 list \| grep claude-mem-worker` → status=online | N/A — infra-only |
| MEM-02 | All sessions use shared store via SessionStart hook | operational | Check `/home/services/.claude-mem/claude-mem.db` grows after a session | N/A |
| MEM-03 | Cross-project recall works | integration | Post observation in project A → `search()` in project B returns it | N/A |
| MEM-04 | Resource footprint documented | observability | `ps -o rss= -p $(pgrep -f worker-service)` + `du -sh /home/services/.claude-mem/` | N/A |

### Sampling Rate
- **Per plan commit:** `curl -s http://127.0.0.1:37700/api/health | jq .status` returns `"ok"`
- **Per wave merge:** Full operational verification (worker running, observations accumulating, MCP tools available in `/mcp`)
- **Phase gate:** Worker has been running 24h+ and `sqlite3 /home/services/.claude-mem/claude-mem.db "SELECT COUNT(*) FROM observations;"` shows >0 rows

### Wave 0 Gaps
None — this phase installs a new external service. No test infra or code scaffolding needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | No | OpenRouter API key in settings.json — not authentication-system-facing |
| V3 Session Management | No | Not applicable |
| V4 Access Control | No | Single-user VPs — no access boundary needed |
| V5 Input Validation | Low | claude-mem hooks process arbitrary tool outputs; built-in sanitization |
| V6 Cryptography | No | No new crypto; Chroma embeddings are non-sensitive |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| API key leakage in worker logs | Information Disclosure | `CLAUDE_MEM_LOG_LEVEL=INFO` never logs full request bodies; verify no accidental DEBUG mode |
| Observation store contains sensitive data (private keys, tokens) | Information Disclosure | Use `<private>` tags in Claude Code output to exclude from capture; worker respects them |
| Worker port exposed to network (not just localhost) | Elevation of Privilege | `CLAUDE_MEM_WORKER_HOST=127.0.0.1` (default) — binds only to loopback; verified in settings |

## Sources

### Primary (HIGH confidence)
- [Context7 /thedotmack/claude-mem] — hook configuration, settings.json schema, MCP tool API specs, Bun/PM2 architecture, multi-account deployment
- [claude-mem npm registry] — latest version 13.8.1, dependencies, license MIT
- [docs.claude-mem.ai/installation] — `CLAUDE_MEM_DATA_DIR` env var, data directory structure
- [docs.claude-mem.ai/configuration] — full settings reference, provider options, context injection settings
- [docs.claude-mem.ai/pm2-to-bun-migration] — v7.1.0 architecture, Bun ProcessManager, PM2 migration steps
- [Claude Code MCP docs (code.claude.com)] — plugin MCP auto-registration, `.mcp.json` scope, plugin root directory

### Secondary (MEDIUM confidence)
- [docs.claude-mem.ai (llms.txt index)] — confirmed all 33 doc pages exist including installation, configuration, troubleshooting, PM2 migration

### Tertiary (LOW confidence)
- [docs.claude-mem.ai/en/installation] — returned 404; content not retrieved (may have moved)

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — version verified against npm registry; Bun auto-installer pattern confirmed in Context7 snippets
- Architecture: HIGH — full hook lifecycle, worker model, settings precedence all confirmed via Context7 docs
- Pitfalls: MEDIUM — Bun-on-PATH and OpenRouter rate-limit pitfalls are based on pattern analysis of the architecture; not yet observed on this specific VPS

**Research date:** 2026-06-28
**Valid until:** 2026-07-28 (claude-mem releases ~monthly; re-check version before install)
