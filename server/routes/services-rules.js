'use strict';

/**
 * /api/services/rules — user-defined sender/subject → project mapping rules.
 *
 * Used by the email ingestion pipeline (Plan 03) to attribute parsed billing
 * receipts to projects, and by the Services page UI (Plan 04) for inline CRUD.
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');

const listRules = db.prepare('SELECT * FROM service_mapping_rules ORDER BY id DESC');
const getRule = db.prepare('SELECT * FROM service_mapping_rules WHERE id = ?');
const insertRule = db.prepare(`
  INSERT INTO service_mapping_rules (pattern_type, pattern_value, project_key, service)
  VALUES (?, ?, ?, ?)
`);
const updateRule = db.prepare(`
  UPDATE service_mapping_rules SET
    pattern_type = COALESCE(?, pattern_type),
    pattern_value = COALESCE(?, pattern_value),
    project_key = COALESCE(?, project_key),
    service = COALESCE(?, service)
  WHERE id = ?
`);
const deleteRule = db.prepare('DELETE FROM service_mapping_rules WHERE id = ?');

const VALID_TYPES = new Set(['sender', 'subject_contains']);

router.get('/', (_req, res) => {
  res.json({ rules: listRules.all() });
});

router.post('/', express.json(), (req, res) => {
  const { pattern_type, pattern_value, project_key, service = null } = req.body || {};
  if (!VALID_TYPES.has(pattern_type)) {
    return res.status(400).json({ error: 'pattern_type must be sender or subject_contains' });
  }
  if (!pattern_value || !project_key) {
    return res.status(400).json({ error: 'pattern_value and project_key required' });
  }
  const info = insertRule.run(pattern_type, pattern_value, project_key, service);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/:id', express.json(), (req, res) => {
  const { pattern_type, pattern_value, project_key, service } = req.body || {};
  if (pattern_type && !VALID_TYPES.has(pattern_type)) {
    return res.status(400).json({ error: 'invalid pattern_type' });
  }
  const existing = getRule.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'rule not found' });
  updateRule.run(
    pattern_type ?? null,
    pattern_value ?? null,
    project_key ?? null,
    service ?? null,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  deleteRule.run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
