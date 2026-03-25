const express = require("express");
const path = require("path");
const fs = require("fs");
const { readProject } = require("../gsd/readers");
const { resolveFile } = require("../gsd/fileResolver");
const { isTmuxSessionActive } = require('../gsd/tmux');
const { db } = require('../db');

const router = express.Router();

const GSD_DATA_URL = (process.env.GSD_DATA_URL || "").replace(/\/$/, "");

function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, "../../gsd-projects.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

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
      // Enrich tmuxActive locally — upstream (Railway) has no tmux access
      if (data && Array.isArray(data.projects)) {
        const { projects: configProjects } = loadConfig();
        const tmuxMap = Object.fromEntries(
          configProjects.map(({ name, tmux_session }) => [name, isTmuxSessionActive(tmux_session)])
        );
        data.projects = data.projects.map((p) => ({
          ...p,
          tmuxActive: tmuxMap[p.name] ?? false,
        }));
      }
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
    return;
  }
  try {
    const { projects } = loadConfig();
    const sessionQuery = db.prepare(`
      SELECT s.updated_at, tu.input_tokens
      FROM sessions s
      LEFT JOIN token_usage tu ON tu.session_id = s.id
      WHERE s.cwd = ?
      ORDER BY s.updated_at DESC
      LIMIT 1
    `);
    const data = projects.map(({ name, root, tmux_session }) => {
      const row = sessionQuery.get(root);
      return {
        ...readProject(name, root),
        tmuxActive: isTmuxSessionActive(tmux_session),
        contextTokens: row?.input_tokens ?? null,
        sessionUpdatedAt: row?.updated_at ?? null,
      };
    });
    res.json({ projects: data });
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
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send keys to tmux session', detail: err.message });
  }
});

module.exports = router;
