'use strict';

/**
 * /api/env — read and atomically write /home/services/.env.production
 *
 * SECURITY: ENV_FILE_PATH is a hardcoded constant. No user-supplied path is
 * ever accepted. This prevents path traversal entirely.
 *
 * Atomic write: content is written to a temp file in /tmp, then renamed into
 * place. If rename fails (e.g. cross-device), falls back to writeFileSync.
 * A failed write never corrupts the existing file.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const router = express.Router();

// SECURITY: hardcoded — never derived from request input
const ENV_FILE_PATH = '/home/services/.env.production';

/**
 * Parse env file content into structured rows.
 * Each line becomes one row object; order is preserved.
 *
 * @param {string} content
 * @returns {Array<{type: 'entry'|'comment'|'blank', key?: string, value?: string, raw: string}>}
 */
function parseEnvFile(content) {
  return content.split('\n').map((raw) => {
    const trimmed = raw.trim();
    if (trimmed === '') return { type: 'blank', raw };
    if (trimmed.startsWith('#')) return { type: 'comment', raw };
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) return { type: 'comment', raw }; // malformed — treat as comment
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1); // do NOT trim — preserve leading/trailing spaces in value
    return { type: 'entry', key, value, raw };
  });
}

/**
 * Serialise rows back to file content.
 *
 * For 'entry' rows: if key+value are present, reserialise as KEY=VALUE so edits
 * to key or value are reflected. Otherwise fall back to raw.
 * For comment/blank rows: always use raw verbatim.
 */
function serialiseRows(rows) {
  return rows.map((r) => {
    if (r.type === 'entry' && r.key != null && r.value != null) {
      return `${r.key}=${r.value}`;
    }
    return r.raw;
  }).join('\n');
}

// GET /api/env — read and parse the env file
router.get('/', (_req, res) => {
  try {
    const content = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    const rows = parseEnvFile(content);
    res.json({ path: ENV_FILE_PATH, rows });
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.json({ path: ENV_FILE_PATH, rows: [] });
    } else if (err.code === 'EACCES') {
      res.status(403).json({ error: 'EACCES', message: 'Permission denied reading env file' });
    } else {
      console.error('[env] GET error:', err);
      res.status(500).json({ error: err.message });
    }
  }
});

// PUT /api/env — atomically overwrite the env file
router.put('/', (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows must be an array' });
  }

  const content = serialiseRows(rows);
  const tmpPath = path.join(os.tmpdir(), `env-production-${Date.now()}.tmp`);

  try {
    // Write to temp first — if this fails, the target is untouched
    fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    console.error('[env] PUT temp write error:', err);
    return res.status(500).json({ error: err.message });
  }

  try {
    fs.renameSync(tmpPath, ENV_FILE_PATH);
  } catch (renameErr) {
    // Cross-device rename fails on some setups — fall back to copy+delete
    if (renameErr.code === 'EXDEV') {
      try {
        fs.copyFileSync(tmpPath, ENV_FILE_PATH);
        fs.unlinkSync(tmpPath);
      } catch (copyErr) {
        try { fs.unlinkSync(tmpPath); } catch {}
        if (copyErr.code === 'EACCES') {
          return res.status(403).json({ error: 'EACCES', message: 'Permission denied writing env file' });
        }
        console.error('[env] PUT copy error:', copyErr);
        return res.status(500).json({ error: copyErr.message });
      }
    } else if (renameErr.code === 'EACCES') {
      try { fs.unlinkSync(tmpPath); } catch {}
      return res.status(403).json({ error: 'EACCES', message: 'Permission denied writing env file' });
    } else {
      try { fs.unlinkSync(tmpPath); } catch {}
      console.error('[env] PUT rename error:', renameErr);
      return res.status(500).json({ error: renameErr.message });
    }
  }

  const entryCount = rows.filter((r) => r.type === 'entry').length;
  res.json({ ok: true, written: entryCount });
});

module.exports = router;
