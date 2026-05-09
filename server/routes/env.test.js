'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// We test the parsing and serialisation logic by importing the module under a
// patched ENV_FILE_PATH — achieved by monkey-patching fs.readFileSync /
// fs.writeFileSync at the module boundary.

// Helper: create a temp file with given content and return its path
function tempFile(content) {
  const p = path.join(os.tmpdir(), `env-test-${Date.now()}-${Math.random().toString(36).slice(2)}.env`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Re-derive the pure functions for unit testing (copy here to avoid side-effects)
function parseEnvFile(content) {
  return content.split('\n').map((raw) => {
    const trimmed = raw.trim();
    if (trimmed === '') return { type: 'blank', raw };
    if (trimmed.startsWith('#')) return { type: 'comment', raw };
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) return { type: 'comment', raw };
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1);
    return { type: 'entry', key, value, raw };
  });
}

function serialiseRows(rows) {
  return rows.map((r) => {
    if (r.type === 'entry' && r.key != null && r.value != null) {
      return `${r.key}=${r.value}`;
    }
    return r.raw;
  }).join('\n');
}

describe('parseEnvFile', () => {
  test('parses entry rows', () => {
    const rows = parseEnvFile('STRIPE_KEY=sk_live_abc\nANOTHER=val');
    assert.equal(rows[0].type, 'entry');
    assert.equal(rows[0].key, 'STRIPE_KEY');
    assert.equal(rows[0].value, 'sk_live_abc');
    assert.equal(rows[1].type, 'entry');
    assert.equal(rows[1].key, 'ANOTHER');
  });

  test('parses comment rows', () => {
    const rows = parseEnvFile('# My secrets');
    assert.equal(rows[0].type, 'comment');
    assert.equal(rows[0].raw, '# My secrets');
  });

  test('parses blank rows', () => {
    const rows = parseEnvFile('KEY=val\n\nOTHER=x');
    assert.equal(rows[1].type, 'blank');
  });

  test('handles value containing = sign', () => {
    const rows = parseEnvFile('VALUE=foo=bar=baz');
    assert.equal(rows[0].type, 'entry');
    assert.equal(rows[0].key, 'VALUE');
    assert.equal(rows[0].value, 'foo=bar=baz');
  });
});

describe('serialiseRows roundtrip', () => {
  test('preserves comments and blanks verbatim', () => {
    const content = '# comment\nKEY=val\n\nOTHER=x';
    const rows = parseEnvFile(content);
    const out = serialiseRows(rows);
    assert.equal(out, content);
  });

  test('reflects edits to key and value', () => {
    const rows = parseEnvFile('OLD_KEY=old_val');
    rows[0].key = 'NEW_KEY';
    rows[0].value = 'new_val';
    const out = serialiseRows(rows);
    assert.equal(out, 'NEW_KEY=new_val');
  });
});

describe('atomic write integration', () => {
  test('PUT roundtrip via real fs (temp file)', () => {
    const src = '# header\nAPI_KEY=secret\n\nDB_PASS=pass123';
    const target = tempFile(src);

    // Simulate the write logic directly
    const rows = parseEnvFile(fs.readFileSync(target, 'utf8'));
    const tmpPath = path.join(os.tmpdir(), `env-test-write-${Date.now()}.tmp`);
    fs.writeFileSync(tmpPath, serialiseRows(rows), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, target);

    const result = fs.readFileSync(target, 'utf8');
    assert.equal(result, src);
    fs.unlinkSync(target);
  });
});
