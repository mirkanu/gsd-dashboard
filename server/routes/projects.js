'use strict';

/**
 * /api/projects — Project creation, import, and management controller.
 *
 * Endpoints:
 *   GET  /api/projects/github-pats         List available GitHub PAT keys
 *   GET  /api/projects/import-candidates   Unregistered folders under DATA_HOME
 *   POST /api/projects/create              Fire-and-forget creation pipeline
 *   POST /api/projects/import              Register existing folder as GSD project
 *   POST /api/projects/resume/:name        Resume pipeline from last failed step
 *
 * The creation pipeline runs async (202 returned immediately). Progress is tracked
 * in the `creation_state` SQLite table and broadcast via WebSocket so the UI can
 * update live.
 *
 * Security posture:
 *   - All shell commands use execFile (not exec / shell:true) with explicit arg arrays
 *   - sanitizeName() strips disallowed chars before any name reaches shell args
 *   - Path traversal guard: resolvedRoot.startsWith(DATA_HOME + sep)
 *   - GitHub PAT passed as GH_TOKEN env var to child processes (never in CLI args)
 *   - pat_key parameter validated against listSecretKeys() before use
 *   - Per-step execFile timeout: 30s via AbortSignal
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const { db } = require('../db');
const { getSecret, listSecretKeys } = require('../crypto');
const { broadcast } = require('../websocket');

// Lazy-loaded so tests that don't need them can stub via require cache
let _scaffoldProject, _sanitizeName, _STEP_SEQUENCE, _detectUnregisteredFolders;

function getScaffold() {
  if (!_scaffoldProject) {
    const m = require('../gsd/projectScaffold');
    _scaffoldProject = m.scaffoldProject;
    _sanitizeName = m.sanitizeName;
    _STEP_SEQUENCE = m.STEP_SEQUENCE;
  }
  return { scaffoldProject: _scaffoldProject, sanitizeName: _sanitizeName, STEP_SEQUENCE: _STEP_SEQUENCE };
}

function getDetector() {
  if (!_detectUnregisteredFolders) {
    const m = require('../gsd/projectDetector');
    _detectUnregisteredFolders = m.detectUnregisteredFolders;
  }
  return { detectUnregisteredFolders: _detectUnregisteredFolders };
}

// ---------------------------------------------------------------------------
// Config helpers (copied verbatim from server/routes/gsd.js)
// ---------------------------------------------------------------------------

function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function saveConfig(config) {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_HOME = process.env.DATA_HOME || '/data/home';

const DEFAULT_SERVICES = [
  { name: 'GitHub', statusUrl: 'https://www.githubstatus.com/api/v2/status.json' },
  { name: 'Claude', statusUrl: 'https://status.anthropic.com/api/v2/status.json' },
];

// ---------------------------------------------------------------------------
// Plain-English error handler (NPC-05)
// ---------------------------------------------------------------------------

const PLAIN_ERRORS = {
  ENOSPC: 'Not enough disk space to create the project folder.',
  EEXIST: 'A project named {name} already exists — pick a different name.',
  ENOENT: 'The specified folder does not exist.',
  EACCES: 'Permission denied when accessing the project folder.',
};

function toPlainError(err, name) {
  const template = PLAIN_ERRORS[err.code];
  if (template) {
    return template.replace('{name}', name || 'that');
  }
  // Extract first line only — no stack traces
  const firstLine = (err.message || 'Unknown error').split('\n')[0];
  return `Something went wrong: ${firstLine}`;
}

// ---------------------------------------------------------------------------
// SQLite prepared statements
// ---------------------------------------------------------------------------

// Prepared lazily to avoid breaking if creation_state table isn't migrated yet
// (Plan 01 adds the migration; at runtime both plans are merged).
let _upsertCreationState, _getCreationState;

function getUpsertStmt() {
  if (!_upsertCreationState) {
    _upsertCreationState = db.prepare(`
      INSERT INTO creation_state (project_name, last_completed_step, current_step, step_sequence, failed_at_step, error_message, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(project_name) DO UPDATE SET
        last_completed_step = excluded.last_completed_step,
        current_step = excluded.current_step,
        step_sequence = excluded.step_sequence,
        failed_at_step = excluded.failed_at_step,
        error_message = excluded.error_message,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `);
  }
  return _upsertCreationState;
}

function getSelectStmt() {
  if (!_getCreationState) {
    _getCreationState = db.prepare('SELECT * FROM creation_state WHERE project_name = ?');
  }
  return _getCreationState;
}

function upsertState(projectName, { lastStep, currentStep, stepSequence, failedAt, errorMsg }) {
  try {
    getUpsertStmt().run(
      projectName,
      lastStep || null,
      currentStep || null,
      stepSequence ? JSON.stringify(stepSequence) : null,
      failedAt || null,
      errorMsg || null
    );
  } catch (e) {
    console.error('[projects] upsertState failed:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Path traversal guard
// ---------------------------------------------------------------------------

function safeProjectRoot(sanitizedName) {
  const resolvedHome = path.resolve(DATA_HOME);
  const resolvedRoot = path.resolve(resolvedHome, sanitizedName);
  if (!resolvedRoot.startsWith(resolvedHome + path.sep)) {
    return null; // traversal attempt
  }
  return resolvedRoot;
}

// ---------------------------------------------------------------------------
// execFile with timeout helper
// ---------------------------------------------------------------------------

const STEP_TIMEOUT_MS = 30_000; // 30s per pipeline step

function execStep(cmd, args, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);
  return execFileAsync(cmd, args, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

/**
 * Runs one pipeline step and updates creation_state + broadcasts.
 * Returns the updated lastCompletedStep string, or throws on failure.
 */
async function runStep(stepName, fn, projectName, stepSequence, lastCompletedStep) {
  upsertState(projectName, {
    lastStep: lastCompletedStep,
    currentStep: stepName,
    stepSequence,
    failedAt: null,
    errorMsg: null,
  });
  broadcast('project_creation_state', {
    project: projectName,
    step: stepName,
    status: 'running',
    error: null,
  });

  try {
    await fn();
    upsertState(projectName, {
      lastStep: stepName,
      currentStep: null,
      stepSequence,
      failedAt: null,
      errorMsg: null,
    });
    broadcast('project_creation_state', {
      project: projectName,
      step: stepName,
      status: 'done',
      error: null,
    });
    return stepName;
  } catch (err) {
    const errMsg = toPlainError(err, projectName);
    upsertState(projectName, {
      lastStep: lastCompletedStep,
      currentStep: null,
      stepSequence,
      failedAt: stepName,
      errorMsg: errMsg,
    });
    broadcast('project_creation_state', {
      project: projectName,
      step: stepName,
      status: 'failed',
      error: errMsg,
    });
    throw err;
  }
}

/**
 * Full creation pipeline. Runs from startFromStep onwards.
 */
async function runCreationPipeline(opts) {
  const { sanitizedName, projectRoot, description, visibility, patKey, startFromStep } = opts;
  const { scaffoldProject, STEP_SEQUENCE } = getScaffold();

  const stepFns = {
    async scaffold() {
      await scaffoldProject(projectRoot, { name: sanitizedName, description: description || '' });
    },
    async git_init() {
      await execStep('git', ['-C', projectRoot, 'init', '--initial-branch=main']);
    },
    async github_create() {
      const pat = getSecret(patKey || 'github_pat');
      if (!pat) throw Object.assign(new Error('No GitHub PAT configured. Add one in Services → Credentials.'), { code: 'ENOKEY' });
      await execStep(
        'gh',
        ['repo', 'create', sanitizedName, '--source', projectRoot, '--remote=origin', `--${visibility || 'private'}`],
        {
          env: {
            ...process.env,
            GH_TOKEN: pat,
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: 'echo',
          },
        }
      );
    },
    async git_push() {
      const pat = getSecret(patKey || 'github_pat');
      if (!pat) throw Object.assign(new Error('No GitHub PAT configured.'), { code: 'ENOKEY' });
      const gitEnv = {
        ...process.env,
        GH_TOKEN: pat,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
      };
      await execStep('git', ['-C', projectRoot, 'add', '.'], { env: gitEnv });
      await execStep('git', ['-C', projectRoot, 'commit', '-m', 'chore: initial commit'], { env: gitEnv });
      await execStep('git', ['-C', projectRoot, 'push', '-u', 'origin', 'main'], { env: gitEnv });
    },
    async gsd_install() {
      // GSD is not an npm package — create .claude/get-shit-done symlink
      // pointing to /data/home/.claude/get-shit-done (best-effort, non-fatal)
      const globalGsd = '/data/home/.claude/get-shit-done';
      const dotClaude = path.join(projectRoot, '.claude');
      const symTarget = path.join(dotClaude, 'get-shit-done');
      try {
        if (!fs.existsSync(globalGsd)) return; // GSD not installed globally — skip silently
        if (!fs.existsSync(dotClaude)) fs.mkdirSync(dotClaude, { recursive: true });
        if (!fs.existsSync(symTarget)) fs.symlinkSync(globalGsd, symTarget);
      } catch (e) {
        // Non-fatal — GSD symlink is best-effort; user can re-link manually
        console.warn('[projects] gsd_install symlink failed:', e.message);
      }
    },
    async tmux_start() {
      await execStep('tmux', ['new-session', '-d', '-s', sanitizedName, '-x', '220', '-y', '50']);
      // Register in gsd-projects.json now that session is live
      try {
        const config = loadConfig();
        const already = (config.projects || []).some((p) => p.name === sanitizedName);
        if (!already) {
          config.projects = config.projects || [];
          config.projects.push({
            name: sanitizedName,
            root: projectRoot,
            tmux_session: sanitizedName,
            services: DEFAULT_SERVICES,
          });
          saveConfig(config);
        }
      } catch (e) {
        console.error('[projects] gsd-projects.json update failed:', e.message);
      }
    },
    async claude_launch() {
      await execStep('tmux', ['send-keys', '-t', sanitizedName, `cd ${projectRoot} && claude`, 'Enter']);

      // Poll tmux pane for Claude prompt-ready indicator (up to 30s)
      const BOOT_POLL_MS = 2000;
      const BOOT_TIMEOUT_MS = 30_000;
      const CLAUDE_READY_PATTERN = />\s*$|claude>/i;
      const start = Date.now();
      let ready = false;
      while (Date.now() - start < BOOT_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, BOOT_POLL_MS));
        try {
          const { stdout } = await execFileAsync('tmux', ['capture-pane', '-p', '-t', sanitizedName]);
          if (CLAUDE_READY_PATTERN.test(stdout)) {
            ready = true;
            break;
          }
        } catch {
          // tmux capture-pane may fail briefly after session start — ignore
        }
      }

      if (ready) {
        await execStep('tmux', ['send-keys', '-t', sanitizedName, '/gsd-new-project', 'Enter']);
      } else {
        // Send anyway after fallback wait — Claude may have booted silently
        await execStep('tmux', ['send-keys', '-t', sanitizedName, '/gsd-new-project', 'Enter']);
      }
    },
  };

  const steps = STEP_SEQUENCE || ['scaffold', 'git_init', 'gsd_install', 'github_create', 'git_push', 'tmux_start', 'claude_launch'];

  // Find starting index
  const startIdx = startFromStep ? steps.indexOf(startFromStep) : 0;
  const startAt = startIdx < 0 ? 0 : startIdx;

  let lastCompleted = startIdx > 0 ? steps[startIdx - 1] : null;

  for (let i = startAt; i < steps.length; i++) {
    const stepName = steps[i];
    const fn = stepFns[stepName];
    if (!fn) {
      console.warn('[projects] unknown step:', stepName);
      continue;
    }
    try {
      lastCompleted = await runStep(stepName, fn, sanitizedName, steps, lastCompleted);
    } catch {
      // runStep already persisted failure and broadcast; stop pipeline
      return;
    }
  }

  // Pipeline complete — broadcast success
  broadcast('project_creation_state', {
    project: sanitizedName,
    step: 'complete',
    status: 'complete',
    error: null,
  });
}

// ---------------------------------------------------------------------------
// GET /api/projects/github-pats
// Lists all GitHub PAT keys (github_pat and github_pat_*) with metadata.
// ---------------------------------------------------------------------------

router.get('/github-pats', (_req, res) => {
  try {
    const keys = listSecretKeys();
    const patKeys = keys.filter((k) => k.key === 'github_pat' || k.key.startsWith('github_pat_'));
    const pats = patKeys.map((k) => {
      const label = k.key === 'github_pat' ? 'Default' : k.key.replace(/^github_pat_/, '');
      return { key: k.key, label, set: true };
    });
    return res.json({ pats });
  } catch (err) {
    return res.status(500).json({ error: toPlainError(err, null) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/projects/import-candidates
// Returns unregistered folders under DATA_HOME.
// ---------------------------------------------------------------------------

router.get('/import-candidates', (_req, res) => {
  try {
    const config = loadConfig();
    const registered = (config.projects || []).map((p) => p.name);
    const { detectUnregisteredFolders } = getDetector();
    const candidates = detectUnregisteredFolders(DATA_HOME, registered);
    return res.json({ candidates });
  } catch (err) {
    return res.status(500).json({ error: toPlainError(err, null) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/create
// ---------------------------------------------------------------------------

router.post('/create', async (req, res) => {
  const { name, description, template, visibility, pat_key } = req.body || {};

  // Input validation
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Project name is required.' });
  }
  if (name.trim().length === 0) {
    return res.status(400).json({ error: 'Project name cannot be empty.' });
  }
  if (name.length > 64) {
    return res.status(400).json({ error: 'Project name must be 64 characters or fewer.' });
  }

  // Validate pat_key if provided
  if (pat_key) {
    try {
      const keys = listSecretKeys();
      const validKeys = keys.map((k) => k.key);
      if (!validKeys.includes(pat_key)) {
        return res.status(400).json({ error: `Unknown PAT key "${pat_key}". Choose a key from the credentials panel.` });
      }
    } catch (err) {
      return res.status(500).json({ error: toPlainError(err, null) });
    }
  }

  let sanitizedName;
  try {
    const { sanitizeName } = getScaffold();
    sanitizedName = sanitizeName(name);
  } catch (err) {
    return res.status(500).json({ error: toPlainError(err, null) });
  }

  if (!sanitizedName || sanitizedName.length === 0) {
    return res.status(400).json({ error: 'Project name contains no valid characters after sanitization. Use letters, numbers, and dashes.' });
  }

  // Must not start with a number
  if (/^\d/.test(sanitizedName)) {
    return res.status(400).json({ error: 'Project name must not start with a number.' });
  }

  // Path traversal guard
  const projectRoot = safeProjectRoot(sanitizedName);
  if (!projectRoot) {
    return res.status(400).json({ error: 'Invalid project path.' });
  }

  // Collision check
  try {
    const config = loadConfig();
    const exists = (config.projects || []).some((p) => p.name === sanitizedName);
    if (exists) {
      return res.status(409).json({ error: PLAIN_ERRORS.EEXIST.replace('{name}', sanitizedName) });
    }
  } catch (err) {
    return res.status(500).json({ error: toPlainError(err, null) });
  }

  // Disk exists check (guard against already-existing folder)
  if (fs.existsSync(projectRoot)) {
    return res.status(409).json({ error: PLAIN_ERRORS.EEXIST.replace('{name}', sanitizedName) });
  }

  // Seed initial creation_state
  const { STEP_SEQUENCE } = getScaffold();
  const stepSeq = STEP_SEQUENCE || ['scaffold', 'git_init', 'gsd_install', 'github_create', 'git_push', 'tmux_start', 'claude_launch'];
  upsertState(sanitizedName, {
    currentStep: 'scaffold',
    stepSequence: stepSeq,
    failedAt: null,
    errorMsg: null,
  });

  // Respond 202 immediately — pipeline runs in background
  res.status(202).json({ ok: true, project: sanitizedName });

  // Fire-and-forget
  setImmediate(() => {
    runCreationPipeline({
      sanitizedName,
      projectRoot,
      description,
      visibility: visibility || 'private',
      patKey: pat_key || 'github_pat',
      startFromStep: null,
    }).catch((err) => {
      console.error('[projects] pipeline error:', err.message);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/projects/import
// ---------------------------------------------------------------------------

router.post('/import', async (req, res) => {
  const { folder, seed } = req.body || {};

  if (!folder || typeof folder !== 'string') {
    return res.status(400).json({ error: 'Folder path is required.' });
  }

  // Must be absolute
  if (!path.isAbsolute(folder)) {
    return res.status(400).json({ error: 'Folder path must be absolute.' });
  }

  // Folder must exist
  if (!fs.existsSync(folder)) {
    return res.status(400).json({ error: 'The specified folder does not exist.' });
  }

  const projectName = path.basename(folder);

  // Check not already registered
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    return res.status(500).json({ error: toPlainError(err, null) });
  }

  const alreadyRegistered = (config.projects || []).some(
    (p) => p.name === projectName || p.root === folder
  );
  if (alreadyRegistered) {
    return res.status(409).json({ error: `Project "${projectName}" is already registered in the Dashboard.` });
  }

  // Register in gsd-projects.json
  try {
    config.projects = config.projects || [];
    const entry = {
      name: projectName,
      root: folder,
      tmux_session: projectName,
      services: DEFAULT_SERVICES,
    };
    config.projects.push(entry);
    saveConfig(config);
  } catch (err) {
    return res.status(500).json({ error: toPlainError(err, null) });
  }

  // Start tmux session
  let tmuxStarted = false;
  try {
    await execStep('tmux', ['new-session', '-d', '-s', projectName, '-x', '220', '-y', '50']);
    tmuxStarted = true;
  } catch (err) {
    // Non-fatal — session may already exist or tmux may not be installed on Railway
    console.warn('[projects] tmux start failed during import:', err.message);
  }

  // If seed requested: start Claude and run /gsd-analyse-codebase
  if (seed && tmuxStarted) {
    setImmediate(async () => {
      try {
        await execStep('tmux', ['send-keys', '-t', projectName, `cd ${folder} && claude`, 'Enter']);

        // Poll for Claude ready (up to 30s)
        const BOOT_POLL_MS = 2000;
        const BOOT_TIMEOUT_MS = 30_000;
        const CLAUDE_READY_PATTERN = />\s*$|claude>/i;
        const start = Date.now();
        while (Date.now() - start < BOOT_TIMEOUT_MS) {
          await new Promise((r) => setTimeout(r, BOOT_POLL_MS));
          try {
            const { stdout } = await execFileAsync('tmux', ['capture-pane', '-p', '-t', projectName]);
            if (CLAUDE_READY_PATTERN.test(stdout)) break;
          } catch {
            // ignore
          }
        }
        await execStep('tmux', ['send-keys', '-t', projectName, '/gsd-analyse-codebase', 'Enter']);
      } catch (e) {
        console.error('[projects] import seed failed:', e.message);
      }
    });
  }

  return res.json({
    ok: true,
    project: {
      name: projectName,
      root: folder,
      tmux_session: projectName,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/projects/resume/:name
// ---------------------------------------------------------------------------

router.post('/resume/:name', async (req, res) => {
  const { name } = req.params;

  let stateRow;
  try {
    stateRow = getSelectStmt().get(name);
  } catch (err) {
    return res.status(500).json({ error: toPlainError(err, null) });
  }

  if (!stateRow) {
    return res.status(404).json({ error: `No creation state found for project "${name}". Nothing to resume.` });
  }

  const { failed_at_step: failedAtStep } = stateRow;
  if (!failedAtStep) {
    return res.status(400).json({ error: `Project "${name}" has no failed step to resume from.` });
  }

  // Path traversal guard
  const { sanitizeName } = getScaffold();
  const sanitizedName = sanitizeName(name);
  const projectRoot = safeProjectRoot(sanitizedName);
  if (!projectRoot) {
    return res.status(400).json({ error: 'Invalid project path.' });
  }

  // Get pat_key from body (optional override)
  const { pat_key } = req.body || {};

  if (pat_key) {
    try {
      const keys = listSecretKeys();
      const validKeys = keys.map((k) => k.key);
      if (!validKeys.includes(pat_key)) {
        return res.status(400).json({ error: `Unknown PAT key "${pat_key}".` });
      }
    } catch (err) {
      return res.status(500).json({ error: toPlainError(err, null) });
    }
  }

  // Clear failed state and start resuming
  upsertState(sanitizedName, {
    lastStep: stateRow.last_completed_step,
    currentStep: failedAtStep,
    stepSequence: stateRow.step_sequence ? JSON.parse(stateRow.step_sequence) : null,
    failedAt: null,
    errorMsg: null,
  });

  res.status(202).json({ ok: true, resuming_from: failedAtStep });

  // Retrieve config to get description/visibility if available
  let description = '';
  let visibility = 'private';
  try {
    const config = loadConfig();
    const proj = (config.projects || []).find((p) => p.name === sanitizedName);
    if (proj) {
      description = proj.description || '';
      visibility = proj.visibility || 'private';
    }
  } catch {
    // non-fatal
  }

  setImmediate(() => {
    runCreationPipeline({
      sanitizedName,
      projectRoot,
      description,
      visibility,
      patKey: pat_key || 'github_pat',
      startFromStep: failedAtStep,
    }).catch((err) => {
      console.error('[projects] resume pipeline error:', err.message);
    });
  });
});

module.exports = router;
