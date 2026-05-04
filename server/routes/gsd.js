const express = require("express");
const path = require("path");
const fs = require("fs");
const { gracefulShutdown } = require('../gsd/gracefulShutdown');
const { readProject } = require("../gsd/readers");
const { resolveFile } = require("../gsd/fileResolver");
const { isTmuxSessionActive, isTmuxSessionActiveAsync, capturePaneText, detectSessionState, detectRateLimit, extractStatusLine, extractCurrentTask, capturePaneTextAsync, detectSessionStateAsync, detectRateLimitAsync } = require('../gsd/tmux');
const { getProjectStateSnapshot } = require('../gsd/stateBroadcaster');
const { execFileSync, spawnSync } = require('child_process');
const { sendNotification, parseOptions, shouldNotify, formatForTelegram, ENABLED: telegramEnabled } = require('../gsd/telegram');
const { db, stmts } = require('../db');
const { calculateCost } = require('./pricing');
const { getTmuxCostForSession } = require('../gsd/costMeasurement');
const busyMarkers = require('../gsd/busyMarkers');

const router = express.Router();

const previousStates = new Map(); // project name → previous sessionState

let projectsCache = null;
let projectsCacheExpiry = 0;
let projectsCacheRefreshing = false;
const PROJECTS_CACHE_TTL = 30000; // 30 seconds — longer than poll interval so users always hit cache
const PROJECTS_CACHE_STALE = 5000; // after 5s, serve from cache but refresh in background

const GSD_DATA_URL = (process.env.GSD_DATA_URL || "").replace(/\/$/, "");
const INTERNAL_HEADERS = process.env.GSD_INTERNAL_SECRET
  ? { 'x-gsd-internal': process.env.GSD_INTERNAL_SECRET }
  : {};

function upstreamFetch(url, opts = {}) {
  const headers = { ...INTERNAL_HEADERS, ...(opts.headers || {}) };
  return fetch(url, { ...opts, headers });
}

function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, "../../gsd-projects.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function saveConfig(config) {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// GET /api/gsd/ws-base — always returns null so browser connects to current host.
// When GSD_DATA_URL is set (Railway proxy mode), terminal WS is proxied server-side
// in terminal.js — the browser never needs to know about the VPS directly.
router.get("/ws-base", (_req, res) => {
  res.json({ wsBase: null });
});

// GET /api/gsd/config — return raw project list from config file
router.get("/config", (_req, res) => {
  try {
    res.json(loadConfig());
  } catch (err) {
    res.status(500).json({ error: "Failed to read gsd-projects.json", detail: err.message });
  }
});

// GET /api/gsd/projects — return parsed planning data for all configured projects
router.get("/projects", async (_req, res) => {
  if (GSD_DATA_URL) {
    // Proxy mode (Railway): stale-while-revalidate pattern.
    // Always serve from cache if available. Refresh in background when stale.
    const now = Date.now();
    if (projectsCache) {
      if (now >= projectsCacheExpiry - (PROJECTS_CACHE_TTL - PROJECTS_CACHE_STALE)) {
        // Cache is older than STALE threshold — trigger background refresh
        if (!projectsCacheRefreshing) {
          projectsCacheRefreshing = true;
          upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects`, { signal: AbortSignal.timeout(10000) })
            .then(r => r.json())
            .then(data => {
              projectsCache = data;
              projectsCacheExpiry = Date.now() + PROJECTS_CACHE_TTL;
            })
            .catch(() => {}) // Keep serving stale on failure
            .finally(() => { projectsCacheRefreshing = false; });
        }
      }
      return res.json(projectsCache);
    }
    // No cache yet — blocking fetch (only happens on first request before warm completes)
    try {
      const upstream = await upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects`, { signal: AbortSignal.timeout(10000) });
      const data = await upstream.json();
      projectsCache = data;
      projectsCacheExpiry = Date.now() + PROJECTS_CACHE_TTL;
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
    return;
  }
  try {
    const { projects } = loadConfig();
    const now = Date.now();

    // Serve from cache if still fresh
    if (projectsCache && now < projectsCacheExpiry) {
      return res.json(projectsCache);
    }

    // Snapshot from background poller — canonical source for stateEnteredAt + currentTask
    const stateSnapshot = getProjectStateSnapshot();

    const sessionQuery = db.prepare(`
      SELECT s.id as session_id, s.updated_at,
        (SELECT MAX(tu.last_input_tokens) FROM token_usage tu WHERE tu.session_id = s.id) as context_tokens
      FROM sessions s
      WHERE s.cwd = ?
      ORDER BY s.updated_at DESC
      LIMIT 1
    `);
    const IDLE_PAUSED_MS = 48 * 60 * 60 * 1000;
    const pricingRules = stmts.listPricing.all();

    const data = await Promise.all(projects.map(async ({ name, root, tmux_session, archived, display_name }) => {
      const row = sessionQuery.get(root);
      let sessionState = archived
        ? 'archived'
        : await detectSessionStateAsync(tmux_session ?? null);
      // Promote waiting → paused if last activity was >48h ago
      if (sessionState === 'waiting' && row?.updated_at) {
        const idleMs = now - new Date(row.updated_at).getTime();
        if (idleMs > IDLE_PAUSED_MS) sessionState = 'paused';
      }
      // Detect state transitions and send Telegram notifications
      if (telegramEnabled && tmux_session) {
        const prevState = previousStates.get(name);
        previousStates.set(name, sessionState);

        if (prevState && prevState !== sessionState) {
          // working → waiting/paused: Claude stopped, user input may be needed
          if (prevState === 'working' && (sessionState === 'waiting' || sessionState === 'paused')) {
            if (shouldNotify(name)) {
              const paneText = await capturePaneTextAsync(tmux_session);
              const options = paneText ? parseOptions(paneText) : [];
              const label = sessionState === 'waiting' ? 'is waiting for your input' : 'has paused';
              const cleanText = paneText ? formatForTelegram(paneText) : '';
              const body = cleanText
                ? `${label}:\n\n${cleanText}`
                : label;
              sendNotification(name, body, options).catch(() => {});
            }
          }
        }
      }

      const statusText = sessionState === 'working'
        ? (extractStatusLine(await capturePaneTextAsync(tmux_session)) || null)
        : null;

      // Resolve stateEnteredAt — prefer broadcaster snapshot when its sessionState
      // matches what we just detected (carries canonical transition timestamp).
      const snap = stateSnapshot[name];
      const stateEnteredAt =
        snap && snap.sessionState === sessionState
          ? snap.stateEnteredAt
          : null; // unknown — do not invent a timestamp; UI hides the elapsed label when null

      // Calculate session cost for the most recent session
      let sessionCost = null;
      if (row?.session_id) {
        const tokenRows = stmts.getTokensBySession.all(row.session_id);
        if (tokenRows.length > 0) {
          sessionCost = calculateCost(tokenRows, pricingRules).total_cost;
        }
      }

      const projectData = readProject(name, root);
      // currentTask: prefer STATE.md's current_phase (semantic, e.g.
      // "43 — Project Status Accuracy (in progress)"), fall back to last_activity.
      const currentTask =
        projectData?.state?.current_phase ||
        projectData?.state?.last_activity ||
        null;

      // Busy markers (Phase 49): prefer snapshot entry, fall back to a fresh read.
      // Field is OMITTED entirely when count===0 to keep the response
      // byte-identical to the pre-phase shape for the common (no-marker) case.
      const snapshotEntry = snap || null;
      const bm = snapshotEntry?.busy_markers
        ?? (tmux_session ? busyMarkers.getMarkers(tmux_session) : { count: 0, kinds: [] });

      // Quick task 260418-khw: waiting + busy markers → emit "working"
      // (user's mental model: waiting means needs-human-input). Mirror of the
      // same override applied in stateBroadcaster so REST + WS agree.
      if (sessionState === 'waiting' && bm && bm.count > 0) {
        sessionState = 'working';
      }

      return {
        ...projectData,
        display_name: display_name || null,
        tmuxActive: await isTmuxSessionActiveAsync(tmux_session),
        tmuxSession: tmux_session ?? null,
        sessionState,
        contextTokens: row?.context_tokens ?? null,
        sessionUpdatedAt: row?.updated_at ?? null,
        statusText,
        stateEnteredAt,
        currentTask,
        sessionCost,
        ...(bm && bm.count > 0 ? { busy_markers: bm } : {}),
      };
    }));

    const tmuxSessions = projects.map(p => p.tmux_session).filter(Boolean);
    const rateLimit = await detectRateLimitAsync(tmuxSessions);

    const result = { projects: data, rateLimit };
    projectsCache = result;
    projectsCacheExpiry = Date.now() + PROJECTS_CACHE_TTL;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to read project data", detail: err.message });
  }
});

// GET /api/gsd/projects/:name/files/:fileId — serve raw planning file content
router.get('/projects/:name/files/:fileId', async (req, res) => {
  const { name, fileId } = req.params;

  if (GSD_DATA_URL) {
    try {
      const upstream = await upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/files/${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) {
        return res.status(upstream.status).json({ error: 'File not found' });
      }
      const text = await upstream.text();
      res.set('Content-Type', 'text/plain; charset=utf-8');
      return res.send(text);
    } catch (err) {
      return res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message });
    }
  }

  const { projects } = loadConfig();
  const project = projects.find((p) => p.name === name);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const validIds = ['state', 'roadmap', 'requirements', 'plan'];
  if (!validIds.includes(fileId)) {
    return res.status(400).json({ error: 'Unknown file identifier' });
  }
  const filePath = resolveFile(name, project.root, fileId);
  if (!filePath) {
    return res.status(404).json({ error: 'File not found' });
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// POST /api/gsd/projects/:name/send — send text to the project's tmux session
router.post('/projects/:name/send', async (req, res) => {
  const { name } = req.params;

  if (GSD_DATA_URL) {
    try {
      const upstream = await fetch(
        `${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(10000),
        }
      );
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message });
    }
  }

  const text = req.body?.text;
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ error: 'text field is required' });
  }

  const { projects } = loadConfig();
  const project = projects.find((p) => p.name === name);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { tmux_session } = project;
  if (!tmux_session) {
    return res.status(422).json({ error: 'No tmux session configured for this project' });
  }

  if (!isTmuxSessionActive(tmux_session)) {
    return res.status(409).json({ error: 'Tmux session is not active', session: tmux_session });
  }

  try {
    if (text.length > 1000) {
      // Large text: use tmux load-buffer (reads from stdin) + paste-buffer to avoid arg length limits
      const load = spawnSync('tmux', ['load-buffer', '-'], { input: text, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] });
      if (load.status !== 0) {
        return res.status(500).json({ error: 'Failed to load buffer in tmux session', detail: load.stderr });
      }
      const paste = spawnSync('tmux', ['paste-buffer', '-t', tmux_session], { stdio: 'ignore' });
      if (paste.status !== 0) {
        return res.status(500).json({ error: 'Failed to paste buffer to tmux session' });
      }
      // Also send Enter after paste
      execFileSync('tmux', ['send-keys', '-t', tmux_session, 'Enter'], { stdio: 'ignore' });
    } else {
      execFileSync('tmux', ['send-keys', '-t', tmux_session, '-l', text], { stdio: 'ignore' });
      execFileSync('tmux', ['send-keys', '-t', tmux_session, 'Enter'], { stdio: 'ignore' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send keys to tmux session', detail: err.message });
  }
});

// POST /api/gsd/projects/:name/reopen-tmux — restart a dead tmux session in the project's directory
router.post('/projects/:name/reopen-tmux', (req, res) => {
  const { name } = req.params;

  if (GSD_DATA_URL) {
    upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/reopen-tmux`,
      { method: 'POST', signal: AbortSignal.timeout(10000) })
      .then(r => r.json().then(d => res.status(r.status).json(d)))
      .catch(err => res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message }));
    return;
  }

  const { projects } = loadConfig();
  const project = projects.find(p => p.name === name);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { tmux_session, root } = project;
  if (!tmux_session) return res.status(422).json({ error: 'No tmux session configured for this project' });

  const isRoot = process.getuid && process.getuid() === 0;
  const claudeCmd = isRoot ? 'claude --effort medium' : 'claude --effort medium --dangerously-skip-permissions';

  try {
    if (isTmuxSessionActive(tmux_session)) {
      // Check whether claude is actually running in the pane (not just a bare shell)
      const paneCmd = execFileSync(
        'tmux', ['list-panes', '-t', tmux_session, '-F', '#{pane_current_command}'],
        { encoding: 'utf8', timeout: 5000 }
      ).trim().split('\n')[0];
      if (paneCmd === 'claude') {
        return res.json({ ok: true, message: 'Session already active' });
      }
      execFileSync('tmux', ['send-keys', '-t', tmux_session, claudeCmd, 'Enter'], { stdio: 'ignore', timeout: 5000 });
      return res.json({ ok: true, message: 'Restarted Claude in existing session' });
    }

    // Create a new detached tmux session with the project's root as the working directory
    // then launch Claude Code with permissions bypass so autopilot/commands work immediately
    execFileSync('tmux', ['new-session', '-d', '-s', tmux_session, '-c', root], { stdio: 'ignore', timeout: 5000 });
    execFileSync('tmux', ['send-keys', '-t', tmux_session, claudeCmd, 'Enter'], { stdio: 'ignore', timeout: 5000 });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create tmux session', detail: err.message });
  }
});

// POST /api/gsd/projects/:name/pause-session — gracefully shut down the tmux session:
// sends /gsd-pause-work, polls for completion markers, kills session, notifies Telegram.
router.post('/projects/:name/pause-session', async (req, res) => {
  const { name } = req.params;

  if (GSD_DATA_URL) {
    upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/pause-session`,
      { method: 'POST', signal: AbortSignal.timeout(40000) })  // extended: graceful-shutdown can take ~30s
      .then(r => r.json().then(d => res.status(r.status).json(d)))
      .catch(err => res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message }));
    return;
  }

  const { projects } = loadConfig();
  const project = projects.find(p => p.name === name);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { tmux_session } = project;
  if (!tmux_session) return res.status(422).json({ error: 'No tmux session configured for this project' });

  try {
    const result = await gracefulShutdown(tmux_session, name);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to pause session', detail: err.message });
  }
});

// POST /api/gsd/projects/:name/kill-session — hard-kill tmux session without sending /gsd-pause-work
router.post('/projects/:name/kill-session', async (req, res) => {
  const { name } = req.params;

  if (GSD_DATA_URL) {
    upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/kill-session`,
      { method: 'POST', signal: AbortSignal.timeout(10000) })
      .then(r => r.json().then(d => res.status(r.status).json(d)))
      .catch(err => res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message }));
    return;
  }

  const { projects } = loadConfig();
  const project = projects.find(p => p.name === name);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { tmux_session } = project;
  if (!tmux_session) return res.status(422).json({ error: 'No tmux session configured for this project' });

  try {
    if (isTmuxSessionActive(tmux_session)) {
      execFileSync('tmux', ['kill-session', '-t', tmux_session], { stdio: 'ignore', timeout: 5000 });
    }
    return res.json({ ok: true, killed: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to kill session', detail: err.message });
  }
});

// GET /api/gsd/projects/:name/tmux-cost — per-session $/day cost estimate
router.get('/projects/:name/tmux-cost', async (req, res) => {
  const { name } = req.params;

  if (GSD_DATA_URL) {
    upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/tmux-cost`,
      { signal: AbortSignal.timeout(10000) })
      .then(r => r.json().then(d => res.status(r.status).json(d)))
      .catch(err => res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message }));
    return;
  }

  const { projects } = loadConfig();
  const project = projects.find(p => p.name === name);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { tmux_session } = project;
  if (!tmux_session) return res.status(422).json({ error: 'No tmux session configured for this project' });

  try {
    const cost = getTmuxCostForSession(tmux_session);
    return res.json({ ok: true, project: name, ...cost });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to compute tmux cost', detail: err.message });
  }
});

// POST /api/gsd/projects/:name/archive
router.post('/projects/:name/archive', (req, res) => {
  if (GSD_DATA_URL) {
    upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(req.params.name)}/archive`,
      { method: 'POST', signal: AbortSignal.timeout(10000) })
      .then(r => r.json().then(d => res.status(r.status).json(d)))
      .catch(err => res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message }));
    return;
  }
  try {
    const config = loadConfig();
    const project = config.projects.find(p => p.name === req.params.name);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.archived = true;
    saveConfig(config);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update config', detail: err.message });
  }
});

// POST /api/gsd/projects/:name/unarchive
router.post('/projects/:name/unarchive', (req, res) => {
  if (GSD_DATA_URL) {
    upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(req.params.name)}/unarchive`,
      { method: 'POST', signal: AbortSignal.timeout(10000) })
      .then(r => r.json().then(d => res.status(r.status).json(d)))
      .catch(err => res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message }));
    return;
  }
  try {
    const config = loadConfig();
    const project = config.projects.find(p => p.name === req.params.name);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    delete project.archived;
    saveConfig(config);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update config', detail: err.message });
  }
});

// POST /api/gsd/projects/create — create a new project directory, tmux session, and config entry
router.post('/projects/create', async (req, res) => {
  if (GSD_DATA_URL) {
    try {
      const upstream = await fetch(
        `${GSD_DATA_URL}/api/gsd/projects/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(15000),
        }
      );
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message });
    }
  }

  const { name, basePath } = req.body || {};

  // Validate name: required, non-empty, only alphanumeric/dash/underscore
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'invalid project name' });
  }

  // Resolve basePath: restrict to an explicit allowlist — path.isAbsolute() alone is not
  // a security boundary and would permit arbitrary paths like /etc or /root.
  const ALLOWED_BASES = ['/data/home'];
  const resolvedBase =
    basePath && typeof basePath === 'string' && ALLOWED_BASES.includes(basePath)
      ? basePath
      : '/data/home';

  const dir = path.join(resolvedBase, name);

  // Early duplicate check — fast-path rejection before any side effects.
  // A second check is performed at write time (against the fresh re-read) to
  // close the race window where two concurrent requests both pass this check.
  try {
    const earlyConfig = loadConfig();
    if (earlyConfig.projects.find((p) => p.name === name)) {
      return res.status(409).json({ error: 'project already exists' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read config', detail: err.message });
  }

  // Create directory
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create project directory', detail: err.message });
  }

  // Create detached tmux session
  try {
    execFileSync('tmux', ['new-session', '-d', '-s', name, '-c', dir], { stdio: 'ignore' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create tmux session', detail: err.message });
  }

  // Send Claude launch sequence into the session
  try {
    execFileSync('tmux', ['send-keys', '-t', name, 'claude', 'Enter'], { stdio: 'ignore' });
    // Brief pause to allow claude to start before the slash command
    await new Promise((r) => setTimeout(r, 500));
    execFileSync('tmux', ['send-keys', '-t', name, '/gsd:new-project', 'Enter'], { stdio: 'ignore' });
  } catch (err) {
    // Non-fatal: session was created, claude launch sequence failed
    // Continue and register the project — user can retry from the terminal
  }

  // Build and persist the new config entry
  const newEntry = { name, root: dir, tmux_session: name };
  try {
    const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
    // Re-read to pick up any writes since we first loaded, and re-check for duplicates
    // atomically — two concurrent creates for the same name would both pass an early
    // check, but checking here against the freshest state closes that race window.
    const freshConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (freshConfig.projects.find((p) => p.name === name)) {
      return res.status(409).json({ error: 'project already exists' });
    }
    freshConfig.projects.push(newEntry);
    fs.writeFileSync(configPath, JSON.stringify(freshConfig, null, 2) + '\n', 'utf8');
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update config', detail: err.message });
  }

  return res.status(201).json({ ok: true, project: newEntry });
});

// POST /api/gsd/projects/:key/tasks — create a task
router.post('/projects/:key/tasks', async (req, res) => {
  const { key } = req.params;
  if (GSD_DATA_URL) {
    try {
      const upstream = await fetch(
        `${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(key)}/tasks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(10000),
        }
      );
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message });
    }
  }
  const { title, description } = req.body || {};
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    const task = stmts.insertTask.get(key, title.trim(), description?.trim() || null);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task', detail: err.message });
  }
});

// GET /api/gsd/projects/:key/tasks — list tasks (?archived=true for archived)
router.get('/projects/:key/tasks', async (req, res) => {
  const { key } = req.params;
  if (GSD_DATA_URL) {
    const qs = req.query.archived === 'true' ? '?archived=true' : '';
    try {
      const upstream = await fetch(
        `${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(key)}/tasks${qs}`,
        { signal: AbortSignal.timeout(10000) }
      );
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message });
    }
  }
  const archived = req.query.archived === 'true' ? 1 : 0;
  try {
    const tasks = stmts.listTasks.all(key, archived);
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list tasks', detail: err.message });
  }
});

// PATCH /api/gsd/projects/:key/tasks/:id — update a task
router.patch('/projects/:key/tasks/:id', async (req, res) => {
  const { key, id } = req.params;
  if (GSD_DATA_URL) {
    try {
      const upstream = await fetch(
        `${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(key)}/tasks/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(10000),
        }
      );
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message });
    }
  }
  const { title, description, archived } = req.body || {};
  // Convert archived boolean or integer (0|1) to 0/1; undefined stays null (COALESCE keeps existing)
  const archivedInt = (archived === true || archived === 1) ? 1
                    : (archived === false || archived === 0) ? 0
                    : null;
  const titleVal = typeof title === 'string' ? title.trim() : null;
  const descVal = typeof description === 'string' ? description.trim() : null;
  try {
    const task = stmts.updateTask.get(titleVal || null, descVal, archivedInt, parseInt(id, 10));
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task', detail: err.message });
  }
});

module.exports = router;
