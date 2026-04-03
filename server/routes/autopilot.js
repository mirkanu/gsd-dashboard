'use strict';

/**
 * autopilot.js — Express routes for the autopilot control API.
 *
 * Six endpoints:
 *   POST /api/autopilot/start      — launch autonomous plan+execute loop
 *   POST /api/autopilot/pause      — pause at next safe point
 *   POST /api/autopilot/resume     — resume from next pending phase
 *   POST /api/autopilot/confirm    — confirm a pending phase spawn
 *   GET  /api/autopilot/status/:projectName — return current run state
 *   POST /api/autopilot/plan-all   — batch-plan all remaining phases (no execute)
 *
 * Run registry: one active AutopilotManager per project at a time.
 * Managers are stored in an in-process Map keyed by projectName.
 *
 * When GSD_DATA_URL is set (Railway proxy mode), all requests are forwarded
 * to the dev machine via the Cloudflare tunnel — autopilot runs locally
 * where tmux, gsd-projects.json, and STATE.md exist.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { AutopilotManager } = require('../autopilot/AutopilotManager');
const { readState } = require('../gsd/readers');

const GSD_DATA_URL = (process.env.GSD_DATA_URL || '').replace(/\/$/, '');

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

/**
 * Proxy a request to the dev machine when GSD_DATA_URL is set.
 * Returns true if proxied (caller should return), false if local.
 */
async function proxyIfRemote(req, res, upstreamPath) {
  if (!GSD_DATA_URL) return false;
  try {
    const opts = { signal: AbortSignal.timeout(30000) };
    if (req.method === 'GET') {
      opts.method = 'GET';
    } else {
      opts.method = req.method;
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(req.body);
    }
    const upstream = await fetch(`${GSD_DATA_URL}${upstreamPath}`, opts);
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message });
  }
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

router._setManagerFactory = function (factory) {
  _managerFactory = factory;
};

router._resetManagerFactory = function () {
  _managerFactory = () => new AutopilotManager();
};

router._clearRun = function (projectName) {
  runRegistry.delete(projectName);
};

/**
 * Clear a runRegistry entry if the run is in a terminal state (failed/completed/stopped).
 * Returns true if the entry was cleared or didn't exist, false if still active.
 */
function clearIfTerminal(projectName) {
  const entry = runRegistry.get(projectName);
  if (!entry) return true;
  const status = entry.manager.getStatus().status;
  if (['failed', 'completed', 'stopped'].includes(status)) {
    runRegistry.delete(projectName);
    return true;
  }
  return false;
}

// ─── POST /api/autopilot/start ────────────────────────────────────────────────

router.post('/start', async (req, res) => {
  if (GSD_DATA_URL) return proxyIfRemote(req, res, '/api/autopilot/start');

  const { projectName, mode } = req.body || {};
  if (!projectName || typeof projectName !== 'string') {
    return res.status(400).json({ error: 'projectName is required' });
  }

  if (!clearIfTerminal(projectName)) {
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

router.post('/pause', (req, res) => {
  if (GSD_DATA_URL) return proxyIfRemote(req, res, '/api/autopilot/pause');

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

router.post('/resume', (req, res) => {
  if (GSD_DATA_URL) return proxyIfRemote(req, res, '/api/autopilot/resume');

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

router.get('/status/:projectName', (req, res) => {
  if (GSD_DATA_URL) return proxyIfRemote(req, res, `/api/autopilot/status/${encodeURIComponent(req.params.projectName)}`);

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

// ─── POST /api/autopilot/confirm ──────────────────────────────────────────────

router.post('/confirm', (req, res) => {
  if (GSD_DATA_URL) return proxyIfRemote(req, res, '/api/autopilot/confirm');

  const { projectName } = req.body || {};
  if (!projectName || typeof projectName !== 'string') {
    return res.status(400).json({ error: 'projectName is required' });
  }

  const entry = runRegistry.get(projectName);
  if (!entry) {
    return res.status(404).json({ error: `No active run found for project: ${projectName}` });
  }

  try {
    entry.manager.confirmSpawn();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/autopilot/plan-all ─────────────────────────────────────────────

router.post('/plan-all', async (req, res) => {
  if (GSD_DATA_URL) return proxyIfRemote(req, res, '/api/autopilot/plan-all');

  const { projectName } = req.body || {};
  if (!projectName || typeof projectName !== 'string') {
    return res.status(400).json({ error: 'projectName is required' });
  }

  if (!clearIfTerminal(projectName)) {
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
