'use strict';

const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const { isTmuxSessionActiveAsync } = require('../gsd/tmux');

function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function attachTerminalWS(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    if (!req.url.startsWith('/ws/terminal/')) {
      // Not our path — let other upgrade handlers deal with it
      return;
    }

    const rawName = req.url.replace(/^\/ws\/terminal\//, '').split('?')[0];
    const projectName = decodeURIComponent(rawName);

    let config;
    try {
      config = loadConfig();
    } catch {
      socket.destroy();
      return;
    }

    const projects = config.projects || config;
    const project = Array.isArray(projects)
      ? projects.find((p) => p.name === projectName)
      : null;

    if (!project) {
      socket.destroy();
      return;
    }

    const session = project.tmux_session;

    if (!(await isTmuxSessionActiveAsync(session))) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.close(4004, 'session inactive');
      });
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      let pty;
      try {
        pty = require('node-pty').spawn('tmux', ['attach-session', '-t', session], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: process.env.HOME || '/',
        });
      } catch {
        ws.close(4005, 'node-pty unavailable');
        return;
      }

      // 16ms PTY output batching — accumulate output into a buffer and flush once per frame (60fps).
      // This prevents xterm.js from receiving one write per byte which causes input lag.
      let ptyBuffer = '';
      let flushTimer = null;

      const flushPty = () => {
        if (ptyBuffer && ws.readyState === 1) {
          ws.send(ptyBuffer);
          ptyBuffer = '';
        }
        flushTimer = null;
      };

      pty.onData((data) => {
        ptyBuffer += data;
        if (!flushTimer) {
          flushTimer = setTimeout(flushPty, 16);
        }
      });

      ws.on('message', (msg) => {
        const str = msg.toString();
        let parsed;
        try {
          parsed = JSON.parse(str);
        } catch {
          pty.write(str);
          return;
        }
        if (parsed && parsed.type === 'resize' && typeof parsed.cols === 'number' && typeof parsed.rows === 'number') {
          pty.resize(parsed.cols, parsed.rows);
        } else {
          pty.write(str);
        }
      });

      pty.onExit(() => {
        if (flushTimer) { clearTimeout(flushTimer); flushPty(); }
        if (ws.readyState === 1) ws.close(1000, 'pty exited');
      });

      ws.on('close', () => {
        if (flushTimer) { clearTimeout(flushTimer); flushPty(); }
        try { pty.kill(); } catch {}
      });
    });
  });
}

module.exports = { attachTerminalWS };
