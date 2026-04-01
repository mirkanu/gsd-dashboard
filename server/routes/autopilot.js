'use strict';

/**
 * autopilot.js — Express routes for the autopilot control API.
 *
 * Five endpoints:
 *   POST /api/autopilot/start      — launch autonomous plan+execute loop
 *   POST /api/autopilot/pause      — pause at next safe point
 *   POST /api/autopilot/resume     — resume from next pending phase
 *   GET  /api/autopilot/status/:projectName — return current run state
 *   POST /api/autopilot/plan-all   — batch-plan all remaining phases (no execute)
 *
 * Run registry: one active AutopilotManager per project at a time.
 * Managers are stored in an in-process Map keyed by projectName.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { AutopilotManager } = require('../autopilot/AutopilotManager');
const { readState } = require('../gsd/readers');

/**
 * Resolve projectName → { root, startPhase, totalPhases } from gsd-projects.json + STATE.md.
 */
function resolveProject(projectName) {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const project = config.projects?.find((p) => p.name === projectName);
  if (!project) return null;

  const root = project.root;
  const state = readState(root);
  const currentPhase = parseInt(state?.current_phase, 10) || 1;
  const totalPhases = state?.progress?.total_phases || currentPhase;

  return { root, startPhase: currentPhase, totalPhases };
}

const router = express.Router();

/**
 * In-memory registry: projectName → { manager: AutopilotManager, runId: string }
 * One active run per project at a time.
 */
const runRegistry = new Map();

/**
 * Default manager factory — creates a real AutopilotManager with production deps.
 * Overridable via _setManagerFactory for tests.
 */
let _managerFactory = () => new AutopilotManager();

// ─── Test hooks (no-op in production, used by autopilotRoutes.test.js) ────────

/**
 * Replace the manager factory. Call _resetManagerFactory() to restore default.
 * @param {Function} factory - () => AutopilotManager-like object
 */
router._setManagerFactory = function (factory) {
  _managerFactory = factory;
};

/**
 * Restore the default (production) manager factory.
 */
router._resetManagerFactory = function () {
  _managerFactory = () => new AutopilotManager();
};

/**
 * Remove a run from the registry (used in tests to reset state between tests).
 * @param {string} projectName
 */
router._clearRun = function (projectName) {
  runRegistry.delete(projectName);
};

// ─── POST /api/autopilot/start ────────────────────────────────────────────────

/**
 * Start an autonomous plan+execute loop for a project.
 * Body: { projectName: string, mode?: 'execute' | 'plan-all' }
 * Response: 200 { runId, status: 'running' }
 *           400 { error } — projectName missing
 *           409 { error } — run already active for this project
 *           500 { error } — unexpected error
 */
router.post('/start', async (req, res) => {
  const { projectName, mode } = req.body || {};
  if (!projectName || typeof projectName !== 'string') {
    return res.status(400).json({ error: 'projectName is required' });
  }

  if (runRegistry.has(projectName)) {
    return res.status(409).json({ error: `Run already active for project: ${projectName}` });
  }

  try {
    const projectInfo = resolveProject(projectName);
    if (!projectInfo) {
      return res.status(404).json({ error: `Project not found in gsd-projects.json: ${projectName}` });
    }
    const manager = _managerFactory();
    const { runId } = await manager.start(projectName, {
      runType: mode || 'execute',
      projectRoot: projectInfo.root,
      startPhase: projectInfo.startPhase,
      totalPhases: projectInfo.totalPhases,
    });
    runRegistry.set(projectName, { manager, runId });
    return res.json({ runId, status: 'running' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/autopilot/pause ────────────────────────────────────────────────

/**
 * Pause an active run at the next safe poll tick.
 * Body: { projectName: string }
 * Response: 200 { ok: true }
 *           400 { error } — projectName missing
 *           404 { error } — no active run for this project
 *           500 { error } — unexpected error
 */
router.post('/pause', (req, res) => {
  const { projectName } = req.body || {};
  if (!projectName || typeof projectName !== 'string') {
    return res.status(400).json({ error: 'projectName is required' });
  }

  const entry = runRegistry.get(projectName);
  if (!entry) {
    return res.status(404).json({ error: `No active run found for project: ${projectName}` });
  }

  try {
    entry.manager.pause();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/autopilot/resume ───────────────────────────────────────────────

/**
 * Resume a paused run.
 * Body: { projectName: string }
 * Response: 200 { ok: true }
 *           400 { error } — projectName missing
 *           404 { error } — no active run for this project
 *           500 { error } — unexpected error
 */
router.post('/resume', (req, res) => {
  const { projectName } = req.body || {};
  if (!projectName || typeof projectName !== 'string') {
    return res.status(400).json({ error: 'projectName is required' });
  }

  const entry = runRegistry.get(projectName);
  if (!entry) {
    return res.status(404).json({ error: `No active run found for project: ${projectName}` });
  }

  try {
    entry.manager.resume();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/autopilot/status/:projectName ───────────────────────────────────

/**
 * Return the current run state for a project.
 * Response: 200 { runId, status, currentPhaseNum, projectName }
 *           — runId is null and status is 'idle' when no run exists
 *           500 { error } — unexpected error
 */
router.get('/status/:projectName', (req, res) => {
  const { projectName } = req.params;

  const entry = runRegistry.get(projectName);
  if (!entry) {
    return res.json({ runId: null, status: 'idle', currentPhaseNum: null, projectName });
  }

  try {
    const status = entry.manager.getStatus();
    return res.json(status);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/autopilot/plan-all ─────────────────────────────────────────────

/**
 * Batch-plan all remaining phases for a project without executing them.
 * Hardcodes mode = 'plan-all'.
 * Body: { projectName: string }
 * Response: 200 { runId, status: 'running' }
 *           400 { error } — projectName missing
 *           409 { error } — run already active for this project
 *           500 { error } — unexpected error
 */
router.post('/plan-all', async (req, res) => {
  const { projectName } = req.body || {};
  if (!projectName || typeof projectName !== 'string') {
    return res.status(400).json({ error: 'projectName is required' });
  }

  if (runRegistry.has(projectName)) {
    return res.status(409).json({ error: `Run already active for project: ${projectName}` });
  }

  try {
    const projectInfo = resolveProject(projectName);
    if (!projectInfo) {
      return res.status(404).json({ error: `Project not found in gsd-projects.json: ${projectName}` });
    }
    const manager = _managerFactory();
    const { runId } = await manager.start(projectName, {
      runType: 'plan-all',
      projectRoot: projectInfo.root,
      startPhase: projectInfo.startPhase,
      totalPhases: projectInfo.totalPhases,
    });
    runRegistry.set(projectName, { manager, runId });
    return res.json({ runId, status: 'running' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
