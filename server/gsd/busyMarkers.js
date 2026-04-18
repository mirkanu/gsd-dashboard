'use strict';

/**
 * busyMarkers.js — per-session "busy work" marker storage.
 *
 * Purpose: let the idle detector (Plan 02) and UI broadcaster (Plan 03) know
 * when a Claude Code session is waiting on in-flight background work
 * (Bash run_in_background=true, Agent/Task subagent, or a ScheduleWakeup).
 *
 * Storage: one JSON file per tmux session under `data/busy-markers/<session>.json`.
 * This is short-lived, cheap, synchronous file I/O — the idle detector tick runs
 * every 60s and the Claude Code hook handler is a one-shot Node process. Do NOT
 * migrate to async fs.promises or SQLite without a strong reason; the callers
 * depend on sync semantics.
 *
 * Public API (stable contract — Plans 02 and 03 depend on these names):
 *   writeMarker(sessionName, { id, kind, ttlMs, toolName, note }) — upsert by id
 *   clearMarker(sessionName, id)                                  — remove by id (no-op if absent)
 *   hasBusyMarkers(sessionName)                                   — boolean; purges expired as side-effect
 *   getMarkers(sessionName)                                       — { count, kinds } deduped + sorted
 *   sweepExpired()                                                — purge expired across all sessions
 *   _setBaseDir(dir)                                              — test hook
 *
 * Marker schema (per CONTEXT.md):
 *   { id, kind: 'bash_bg'|'agent'|'wakeup', started_at: ISO, ttl_ms, tool_name, note }
 *
 * TTL defaults (when ttlMs omitted in writeMarker):
 *   bash_bg: 4h (14_400_000 ms)
 *   agent:   2h (7_200_000 ms)
 *   wakeup:  5min (300_000 ms) — callers should pass explicit delay + grace
 *
 * Fail-safe: read errors and parse failures are treated as "no markers"; write
 * errors bubble up so callers can log them. Path traversal (`/`, `\`, `..`) in
 * sessionName throws — callers MUST sanitize before calling.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_BASE_DIR = path.resolve(__dirname, '../../data/busy-markers');

let BASE_DIR = DEFAULT_BASE_DIR;

const TTL_DEFAULTS = {
  bash_bg: 14_400_000, // 4h
  agent: 7_200_000,    // 2h
  wakeup: 300_000,     // 5min grace (caller should pass delay + 5min)
};

function _setBaseDir(dir) {
  BASE_DIR = dir || DEFAULT_BASE_DIR;
}

function _validateSessionName(sessionName) {
  if (!sessionName || typeof sessionName !== 'string') {
    throw new Error('invalid session name');
  }
  if (sessionName.includes('/') || sessionName.includes('\\') || sessionName.includes('..')) {
    throw new Error('invalid session name');
  }
}

function _filePath(sessionName) {
  return path.join(BASE_DIR, `${sessionName}.json`);
}

function _readFile(sessionName) {
  const fp = _filePath(sessionName);
  if (!fs.existsSync(fp)) return { markers: [] };
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.markers)) return { markers: [] };
    return parsed;
  } catch {
    return { markers: [] };
  }
}

function _writeFile(sessionName, data) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  const fp = _filePath(sessionName);
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, fp);
}

function _deleteFile(sessionName) {
  const fp = _filePath(sessionName);
  try {
    fs.unlinkSync(fp);
  } catch {
    // ignore
  }
}

function _isExpired(marker, now = Date.now()) {
  if (!marker || !marker.started_at) return true;
  const started = Date.parse(marker.started_at);
  if (isNaN(started)) return true;
  const ttl = Number(marker.ttl_ms) || 0;
  return started + ttl <= now;
}

/**
 * Read + prune expired markers. Returns live array.
 * Side-effect: writes back pruned list (or deletes file) if anything was dropped.
 */
function _readAndPrune(sessionName) {
  _validateSessionName(sessionName);
  const data = _readFile(sessionName);
  const all = Array.isArray(data.markers) ? data.markers : [];
  const live = all.filter((m) => !_isExpired(m));
  if (live.length !== all.length) {
    if (live.length === 0) {
      _deleteFile(sessionName);
    } else {
      _writeFile(sessionName, { markers: live });
    }
  }
  return live;
}

function writeMarker(sessionName, { id, kind, ttlMs, toolName, note } = {}) {
  _validateSessionName(sessionName);
  if (!id || typeof id !== 'string') throw new Error('marker id required');
  if (!kind || typeof kind !== 'string') throw new Error('marker kind required');

  const effectiveTtl = Number.isFinite(ttlMs) && ttlMs > 0
    ? ttlMs
    : (TTL_DEFAULTS[kind] || 3_600_000);

  const data = _readFile(sessionName);
  const existing = Array.isArray(data.markers) ? data.markers : [];
  const filtered = existing.filter((m) => m && m.id !== id);
  filtered.push({
    id,
    kind,
    started_at: new Date().toISOString(),
    ttl_ms: effectiveTtl,
    tool_name: toolName || null,
    note: note || null,
  });
  _writeFile(sessionName, { markers: filtered });
}

function clearMarker(sessionName, id) {
  _validateSessionName(sessionName);
  if (!id) return;
  const fp = _filePath(sessionName);
  if (!fs.existsSync(fp)) return;
  const data = _readFile(sessionName);
  const existing = Array.isArray(data.markers) ? data.markers : [];
  const filtered = existing.filter((m) => m && m.id !== id);
  if (filtered.length === existing.length) return; // no change
  if (filtered.length === 0) {
    _deleteFile(sessionName);
  } else {
    _writeFile(sessionName, { markers: filtered });
  }
}

function hasBusyMarkers(sessionName) {
  try {
    const live = _readAndPrune(sessionName);
    return live.length > 0;
  } catch {
    return false;
  }
}

function getMarkers(sessionName) {
  try {
    const live = _readAndPrune(sessionName);
    const kinds = Array.from(new Set(live.map((m) => m.kind).filter(Boolean))).sort();
    return { count: live.length, kinds };
  } catch {
    return { count: 0, kinds: [] };
  }
}

function sweepExpired() {
  if (!fs.existsSync(BASE_DIR)) return;
  let entries;
  try {
    entries = fs.readdirSync(BASE_DIR);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const sessionName = entry.slice(0, -'.json'.length);
    try {
      _readAndPrune(sessionName);
    } catch {
      // swallow per-file errors; one bad file shouldn't abort the sweep
    }
  }
}

module.exports = {
  writeMarker,
  clearMarker,
  hasBusyMarkers,
  getMarkers,
  sweepExpired,
  _setBaseDir,
};
