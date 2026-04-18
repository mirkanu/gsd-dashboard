'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const busyMarkers = require('../gsd/busyMarkers');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'busy-markers-test-'));
  busyMarkers._setBaseDir(tmpDir);
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
  busyMarkers._setBaseDir(null); // reset to default
});

function readRaw(session) {
  const fp = path.join(tmpDir, `${session}.json`);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

test('writeMarker creates file with expected schema', () => {
  busyMarkers.writeMarker('session-a', {
    id: 'shell-1', kind: 'bash_bg', toolName: 'Bash', note: 'poll backfill',
  });
  const raw = readRaw('session-a');
  assert.ok(raw, 'file should exist');
  assert.strictEqual(raw.markers.length, 1);
  const m = raw.markers[0];
  assert.strictEqual(m.id, 'shell-1');
  assert.strictEqual(m.kind, 'bash_bg');
  assert.strictEqual(m.tool_name, 'Bash');
  assert.strictEqual(m.note, 'poll backfill');
  assert.strictEqual(m.ttl_ms, 14_400_000);
  assert.ok(m.started_at, 'started_at populated');
  assert.ok(!isNaN(Date.parse(m.started_at)), 'started_at is a valid ISO timestamp');
});

test('writeMarker upsert: same id twice → one marker', () => {
  busyMarkers.writeMarker('session-a', { id: 'shell-1', kind: 'bash_bg' });
  busyMarkers.writeMarker('session-a', { id: 'shell-1', kind: 'bash_bg', note: 'updated' });
  const raw = readRaw('session-a');
  assert.strictEqual(raw.markers.length, 1);
  assert.strictEqual(raw.markers[0].note, 'updated');
});

test('clearMarker removes marker; removing last marker deletes the file', () => {
  busyMarkers.writeMarker('session-b', { id: 'a', kind: 'bash_bg' });
  busyMarkers.writeMarker('session-b', { id: 'b', kind: 'agent' });

  busyMarkers.clearMarker('session-b', 'a');
  let raw = readRaw('session-b');
  assert.strictEqual(raw.markers.length, 1);
  assert.strictEqual(raw.markers[0].id, 'b');

  busyMarkers.clearMarker('session-b', 'b');
  raw = readRaw('session-b');
  assert.strictEqual(raw, null, 'file should be deleted when last marker is cleared');
});

test('clearMarker is a no-op for missing file / unknown id', () => {
  // missing file
  busyMarkers.clearMarker('session-never-existed', 'x');
  assert.strictEqual(readRaw('session-never-existed'), null);

  // unknown id
  busyMarkers.writeMarker('session-c', { id: 'real', kind: 'agent' });
  busyMarkers.clearMarker('session-c', 'ghost');
  const raw = readRaw('session-c');
  assert.strictEqual(raw.markers.length, 1);
});

test('hasBusyMarkers returns true for non-expired, false + purges when all expired', () => {
  // non-expired
  busyMarkers.writeMarker('session-d', { id: 'x', kind: 'bash_bg' });
  assert.strictEqual(busyMarkers.hasBusyMarkers('session-d'), true);

  // manually rewrite with an expired marker
  const fp = path.join(tmpDir, 'session-e.json');
  fs.writeFileSync(fp, JSON.stringify({
    markers: [{
      id: 'stale', kind: 'bash_bg',
      started_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), // 10h ago
      ttl_ms: 60_000, // 1 minute TTL → expired
      tool_name: 'Bash', note: null,
    }],
  }));

  assert.strictEqual(busyMarkers.hasBusyMarkers('session-e'), false);
  assert.strictEqual(fs.existsSync(fp), false, 'file should be purged when all markers expired');
});

test('hasBusyMarkers returns false for unknown session (missing file)', () => {
  assert.strictEqual(busyMarkers.hasBusyMarkers('ghost-session'), false);
});

test('TTL defaults applied per kind when ttlMs omitted', () => {
  busyMarkers.writeMarker('session-f', { id: '1', kind: 'bash_bg' });
  busyMarkers.writeMarker('session-f', { id: '2', kind: 'agent' });
  const raw = readRaw('session-f');
  const byId = Object.fromEntries(raw.markers.map((m) => [m.id, m]));
  assert.strictEqual(byId['1'].ttl_ms, 14_400_000, 'bash_bg default = 4h');
  assert.strictEqual(byId['2'].ttl_ms, 7_200_000, 'agent default = 2h');
});

test('explicit ttlMs overrides default', () => {
  busyMarkers.writeMarker('session-g', { id: '1', kind: 'bash_bg', ttlMs: 5000 });
  const raw = readRaw('session-g');
  assert.strictEqual(raw.markers[0].ttl_ms, 5000);
});

test('invalid session name throws', () => {
  assert.throws(() => busyMarkers.writeMarker('../etc', { id: 'x', kind: 'agent' }), /invalid session name/);
  assert.throws(() => busyMarkers.writeMarker('a/b', { id: 'x', kind: 'agent' }), /invalid session name/);
  assert.throws(() => busyMarkers.writeMarker('a\\b', { id: 'x', kind: 'agent' }), /invalid session name/);
  assert.throws(() => busyMarkers.writeMarker('', { id: 'x', kind: 'agent' }), /invalid session name/);
});

test('sweepExpired removes files whose markers are all expired', () => {
  // live session
  busyMarkers.writeMarker('live', { id: '1', kind: 'bash_bg' });

  // expired session (write manually so we can backdate)
  const expiredFp = path.join(tmpDir, 'dead.json');
  fs.writeFileSync(expiredFp, JSON.stringify({
    markers: [{
      id: 'z', kind: 'agent',
      started_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      ttl_ms: 60_000,
      tool_name: 'Agent', note: null,
    }],
  }));

  busyMarkers.sweepExpired();

  assert.strictEqual(fs.existsSync(expiredFp), false, 'expired file purged');
  assert.strictEqual(fs.existsSync(path.join(tmpDir, 'live.json')), true, 'live file kept');
});

test('getMarkers returns deduped + sorted kinds', () => {
  busyMarkers.writeMarker('session-h', { id: '1', kind: 'bash_bg' });
  busyMarkers.writeMarker('session-h', { id: '2', kind: 'bash_bg' });
  busyMarkers.writeMarker('session-h', { id: '3', kind: 'agent' });
  busyMarkers.writeMarker('session-h', { id: '4', kind: 'wakeup' });

  const out = busyMarkers.getMarkers('session-h');
  assert.strictEqual(out.count, 4);
  assert.deepStrictEqual(out.kinds, ['agent', 'bash_bg', 'wakeup']);
});

test('getMarkers returns zero/empty for unknown session', () => {
  const out = busyMarkers.getMarkers('nope');
  assert.strictEqual(out.count, 0);
  assert.deepStrictEqual(out.kinds, []);
});
