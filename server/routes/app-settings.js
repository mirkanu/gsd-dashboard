'use strict';

/**
 * /api/app-settings — encrypted credential storage CRUD.
 *
 * Never returns plaintext or ciphertext fields over the wire. Only metadata
 * (key, set flag, updated_at). Writes go through server/crypto.js#setSecret
 * (AES-256-GCM, master key derived from DASHBOARD_SECRET_KEY).
 *
 * Consumed by Phase 45 Plan 04 (CredentialsPanel UI) and Phase 46 API
 * integration routes that call getSecret() directly server-side.
 */

const express = require('express');
const router = express.Router();
const { setSecret, listSecretKeys } = require('../crypto');
const { db } = require('../db');

const deleteSecretStmt = db.prepare('DELETE FROM app_settings WHERE key = ?');
const hasKeyStmt = db.prepare('SELECT updated_at FROM app_settings WHERE key = ?');

// Phase 48 defaults — seeded on first GET if not already set.
const PHASE_48_DEFAULTS = [
  {
    key: 'idle_timeout_minutes',
    defaultValue: '120',
  },
  {
    key: 'railway_ram_rate_monthly',
    defaultValue: '10.0',
  },
];

function seedPhase48Defaults() {
  for (const { key, defaultValue } of PHASE_48_DEFAULTS) {
    const existing = hasKeyStmt.get(key);
    if (!existing) {
      setSecret(key, defaultValue);
    }
  }
}

// GET /api/app-settings — list keys with metadata only.
router.get('/', (_req, res) => {
  try {
    seedPhase48Defaults();
  } catch (e) {
    // Non-fatal: DASHBOARD_SECRET_KEY may not be set in test environments
    console.warn('[app-settings] seed skipped:', e.message);
  }
  const rows = listSecretKeys();
  res.json({
    keys: rows.map((r) => ({ key: r.key, updated_at: r.updated_at, set: true })),
  });
});

// GET /api/app-settings/:key — metadata for one key; 404 if missing.
router.get('/:key', (req, res) => {
  const row = hasKeyStmt.get(req.params.key);
  if (!row) return res.status(404).json({ error: 'not set' });
  res.json({ key: req.params.key, set: true, updated_at: row.updated_at });
});

// PUT /api/app-settings/:key — upsert an encrypted value.
router.put('/:key', express.json(), (req, res) => {
  const { value } = req.body || {};
  if (typeof value !== 'string' || value.length === 0) {
    return res.status(400).json({ error: 'value must be a non-empty string' });
  }
  try {
    setSecret(req.params.key, value);
    res.json({ ok: true });
  } catch (e) {
    console.error('[app-settings PUT]', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/app-settings/:key — remove a stored secret.
router.delete('/:key', (req, res) => {
  deleteSecretStmt.run(req.params.key);
  res.json({ ok: true });
});

module.exports = router;
