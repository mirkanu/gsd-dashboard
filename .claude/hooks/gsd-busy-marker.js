#!/usr/bin/env node
// gsd-hook-version: 1.36.0
// Busy Marker hook — PreToolUse / PostToolUse / SubagentStop / Stop
//
// Purpose: write/clear per-session busy markers so the idle detector (Plan 02)
// can distinguish "Claude is idle" from "Claude is waiting on in-flight
// background work" (run_in_background Bash, Agent subagent, ScheduleWakeup).
//
// Events handled (via Claude Code stdin JSON payload):
//   PreToolUse  + tool_name=Bash + tool_input.run_in_background===true
//                   → writeMarker(tmux, { id=tool_use_id, kind='bash_bg' })
//   PreToolUse  + tool_name matches /^(Agent|Task)$/
//                   → writeMarker(tmux, { id=tool_use_id, kind='agent' })
//   PostToolUse + tool_name=Bash
//                   → clearMarker(tmux, tool_use_id)
//   SubagentStop
//                   → clearMarker(tmux, tool_use_id)
//   Stop  (when payload signals a pending scheduled wakeup)
//                   → writeMarker(tmux, { id='wakeup-<ts>', kind='wakeup',
//                                         ttlMs=wakeup_delay_ms + 5min grace })
//
// Fail-safe contract (MANDATORY — see CLAUDE.md hook rules):
//   * 5s stdin-read timeout → exit 0 silently
//   * all errors swallowed; stderr-only logging; never throws; always exit 0
//   * path-traversal guard on tmux session name (`/`, `\`, `..` → abort)
//   * never blocks or mutates Claude's tool flow
//
// Environment overrides (used by tests):
//   GSD_PROJECTS_PATH      — explicit path to gsd-projects.json
//   GSD_BUSY_MARKERS_DIR   — override busy-markers base dir

const fs = require('fs');
const path = require('path');

let busyMarkers;
try {
  busyMarkers = require(path.resolve(__dirname, '../../server/gsd/busyMarkers'));
} catch (e) {
  // Helper module missing — nothing we can do; fail silently.
  process.stderr.write(`gsd-busy-marker: helper load failed: ${e && e.message}\n`);
  process.exit(0);
}

if (process.env.GSD_BUSY_MARKERS_DIR) {
  try { busyMarkers._setBaseDir(process.env.GSD_BUSY_MARKERS_DIR); } catch { /* ignore */ }
}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 5000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    run(input);
  } catch (e) {
    process.stderr.write(`gsd-busy-marker: ${e && e.message}\n`);
  }
  process.exit(0);
});

function run(raw) {
  if (!raw) return;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return; // malformed — swallow
  }
  if (!payload || typeof payload !== 'object') return;

  const event = payload.hook_event_name;
  if (!event) return;

  const cwd = payload.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const tmuxSession = resolveTmuxSession(cwd);
  if (!tmuxSession) return;

  // Path-traversal guard on session name (defense in depth; busyMarkers also guards).
  if (/[/\\]|\.\./.test(tmuxSession)) return;

  const toolName = payload.tool_name;
  const toolInput = payload.tool_input || {};
  const toolUseId = payload.tool_use_id;

  if (event === 'PreToolUse') {
    if (toolName === 'Bash' && toolInput && toolInput.run_in_background === true) {
      if (!toolUseId) return;
      safeWrite(tmuxSession, {
        id: toolUseId,
        kind: 'bash_bg',
        toolName: 'Bash',
        note: truncate(toolInput.description || toolInput.command || ''),
      });
      return;
    }
    if (toolName && /^(Agent|Task)$/.test(toolName)) {
      if (!toolUseId) return;
      safeWrite(tmuxSession, {
        id: toolUseId,
        kind: 'agent',
        toolName,
        note: truncate(toolInput.description || ''),
      });
      return;
    }
    return;
  }

  if (event === 'PostToolUse') {
    if (toolName === 'Bash' && toolUseId) {
      safeClear(tmuxSession, toolUseId);
    }
    return;
  }

  if (event === 'SubagentStop') {
    if (toolUseId) {
      safeClear(tmuxSession, toolUseId);
    }
    return;
  }

  if (event === 'Stop') {
    // Claude Code's Stop schema is not fully documented; guard all fields.
    // Fire a wakeup marker only when we have an explicit delay signal.
    const delayMs = Number(
      payload.wakeup_delay_ms
      || (payload.scheduled_wakeup && payload.scheduled_wakeup.delay_ms)
      || 0
    );
    const isScheduledWakeup = payload.stop_reason === 'schedule_wakeup'
      || !!payload.scheduled_wakeup_at
      || !!payload.scheduled_wakeup
      || delayMs > 0;

    if (!isScheduledWakeup) return;
    const ttlMs = (delayMs > 0 ? delayMs : 0) + 300_000; // +5min grace
    safeWrite(tmuxSession, {
      id: `wakeup-${Date.now()}`,
      kind: 'wakeup',
      ttlMs,
      toolName: 'ScheduleWakeup',
      note: null,
    });
  }
}

function safeWrite(session, opts) {
  try {
    busyMarkers.writeMarker(session, opts);
  } catch (e) {
    process.stderr.write(`gsd-busy-marker: writeMarker failed: ${e && e.message}\n`);
  }
}

function safeClear(session, id) {
  try {
    busyMarkers.clearMarker(session, id);
  } catch (e) {
    process.stderr.write(`gsd-busy-marker: clearMarker failed: ${e && e.message}\n`);
  }
}

function truncate(s) {
  if (!s || typeof s !== 'string') return null;
  return s.slice(0, 80);
}

/**
 * Resolve tmux session name for a given cwd by reading gsd-projects.json.
 * Walks up from cwd until the file is found (or GSD_PROJECTS_PATH override).
 * Returns null if no matching project / no tmux_session.
 */
function resolveTmuxSession(cwd) {
  try {
    const projectsPath = process.env.GSD_PROJECTS_PATH || findProjectsJson(cwd);
    if (!projectsPath || !fs.existsSync(projectsPath)) return null;
    const raw = fs.readFileSync(projectsPath, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed && parsed.projects);
    if (!Array.isArray(list)) return null;

    const resolvedCwd = path.resolve(cwd);
    // Prefer exact root match; fall back to "cwd starts with root/".
    let match = list.find((p) => p && p.root && path.resolve(p.root) === resolvedCwd);
    if (!match) {
      match = list.find((p) => {
        if (!p || !p.root) return false;
        const root = path.resolve(p.root);
        return resolvedCwd === root || resolvedCwd.startsWith(`${root}${path.sep}`);
      });
    }
    if (!match || !match.tmux_session) return null;
    return match.tmux_session;
  } catch {
    return null;
  }
}

function findProjectsJson(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  // Walk up a bounded number of levels to avoid runaway loops on fs errors.
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'gsd-projects.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
