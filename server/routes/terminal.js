'use strict';

const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const { isTmuxSessionActive } = require('../gsd/tmux');

function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function attachTerminalWS(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
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

    if (!isTmuxSessionActive(session)) {
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

      pty.onData((data) => {
        if (ws.readyState === 1) ws.send(data);
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
        if (ws.readyState === 1) ws.close(1000, 'pty exited');
      });

      ws.on('close', () => {
        try { pty.kill(); } catch {}
      });
    });
  });
}

module.exports = { attachTerminalWS };
