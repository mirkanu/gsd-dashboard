const express = require("express");
const path = require("path");
const fs = require("fs");
const { readProject } = require("../gsd/readers");
const { resolveFile } = require("../gsd/fileResolver");
const { isTmuxSessionActive, capturePaneText, detectSessionState, detectRateLimit } = require('../gsd/tmux');
const { sendNotification, parseOptions, shouldNotify, formatForTelegram, ENABLED: telegramEnabled } = require('../gsd/telegram');
const { db, stmts } = require('../db');

const router = express.Router();

const previousStates = new Map(); // project name → previous sessionState

const GSD_DATA_URL = (process.env.GSD_DATA_URL || "").replace(/\/$/, "");

function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, "../../gsd-projects.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function saveConfig(config) {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// GET /api/gsd/ws-base — returns the WebSocket base URL for terminal connections
// When GSD_DATA_URL is set (Railway proxy mode), terminal WebSocket must connect
// to the tunnel directly since Railway has no tmux/node-pty.
router.get("/ws-base", (_req, res) => {
  if (GSD_DATA_URL) {
    const wsBase = GSD_DATA_URL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    res.json({ wsBase });
  } else {
    res.json({ wsBase: null });
  }
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
    try {
      const upstream = await fetch(`${GSD_DATA_URL}/api/gsd/projects`, { signal: AbortSignal.timeout(10000) });
      const data = await upstream.json();
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
    return;
  }
  try {
    const { projects } = loadConfig();
    const sessionQuery = db.prepare(`
      SELECT s.updated_at,
        (SELECT MAX(tu.last_input_tokens) FROM token_usage tu WHERE tu.session_id = s.id) as context_tokens
      FROM sessions s
      WHERE s.cwd = ?
      ORDER BY s.updated_at DESC
      LIMIT 1
    `);
    const IDLE_PAUSED_MS = 48 * 60 * 60 * 1000;
    const now = Date.now();
    const data = projects.map(({ name, root, tmux_session, archived, display_name }) => {
      const row = sessionQuery.get(root);
      let sessionState = archived
        ? 'archived'
        : detectSessionState(tmux_session ?? null);
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
              const paneText = capturePaneText(tmux_session);
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

      return {
        ...readProject(name, root),
        display_name: display_name || null,
        tmuxActive: isTmuxSessionActive(tmux_session),
        tmuxSession: tmux_session ?? null,
        sessionState,
        contextTokens: row?.context_tokens ?? null,
        sessionUpdatedAt: row?.updated_at ?? null,
      };
    });

    const tmuxSessions = projects.map(p => p.tmux_session).filter(Boolean);
    const rateLimit = detectRateLimit(tmuxSessions);

    res.json({ projects: data, rateLimit });
  } catch (err) {
    res.status(500).json({ error: "Failed to read project data", detail: err.message });
  }
});

// GET /api/gsd/projects/:name/files/:fileId — serve raw planning file content
router.get('/projects/:name/files/:fileId', async (req, res) => {
  const { name, fileId } = req.params;

  if (GSD_DATA_URL) {
    try {
      const upstream = await fetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/files/${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(10000) });
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
    const { execFileSync } = require('child_process');
    execFileSync('tmux', ['send-keys', '-t', tmux_session, text, 'Enter'], { stdio: 'ignore' });
    try { stmts.insertGsdMessage.run(name, 'outbound', text); } catch { /* non-blocking */ }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send keys to tmux session', detail: err.message });
  }
});

// GET /api/gsd/projects/:name/messages — paginated message history
router.get('/projects/:name/messages', (req, res) => {
  const { name } = req.params;
  if (GSD_DATA_URL) {
    const qs = new URLSearchParams();
    if (req.query.limit) qs.set('limit', req.query.limit);
    if (req.query.offset) qs.set('offset', req.query.offset);
    const q = qs.toString();
    fetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/messages${q ? `?${q}` : ''}`,
      { signal: AbortSignal.timeout(10000) })
      .then(r => r.json().then(d => res.status(r.status).json(d)))
      .catch(err => res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message }));
    return;
  }
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const messages = stmts.listGsdMessages.all(name, limit, offset);
    const { count: total } = stmts.countGsdMessages.get(name);
    res.json({ messages, total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read messages', detail: err.message });
  }
});

// POST /api/gsd/projects/:name/reopen-tmux — restart a dead tmux session in the project's directory
router.post('/projects/:name/reopen-tmux', (req, res) => {
  const { name } = req.params;

  if (GSD_DATA_URL) {
    fetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(name)}/reopen-tmux`,
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

  if (isTmuxSessionActive(tmux_session)) {
    return res.json({ ok: true, message: 'Session already active' });
  }

  try {
    const { execFileSync } = require('child_process');
    // Create a new detached tmux session with the project's root as the working directory
    execFileSync('tmux', ['new-session', '-d', '-s', tmux_session, '-c', root], { stdio: 'ignore', timeout: 5000 });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create tmux session', detail: err.message });
  }
});

// POST /api/gsd/projects/:name/archive
router.post('/projects/:name/archive', (req, res) => {
  if (GSD_DATA_URL) {
    fetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(req.params.name)}/archive`,
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
    fetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(req.params.name)}/unarchive`,
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
