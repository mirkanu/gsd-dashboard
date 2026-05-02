'use strict';

const path = require('path');
const fs = require('fs');
const { WebSocketServer, WebSocket: WS } = require('ws');
const { isTmuxSessionActiveAsync } = require('../gsd/tmux');

const GSD_DATA_URL = (process.env.GSD_DATA_URL || '').replace(/\/$/, '');
const GSD_INTERNAL_SECRET = process.env.GSD_INTERNAL_SECRET || '';

function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function attachTerminalWS(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    if (!req.url.startsWith('/ws/terminal/')) {
      return;
    }

    // -- Proxy mode (Railway -> VPS) -------------------------------------------
    if (GSD_DATA_URL) {
      const rawName = req.url.replace(/^\/ws\/terminal\//, '').split('?')[0];
      const wsUpstream = GSD_DATA_URL
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')
        + '/ws/terminal/' + rawName;

      const upstreamHeaders = GSD_INTERNAL_SECRET
        ? { 'x-gsd-internal': GSD_INTERNAL_SECRET }
        : {};

      let upstream;
      try {
        upstream = new WS(wsUpstream, { headers: upstreamHeaders });
      } catch (err) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (client) => {
        // Wait for upstream to be ready before bridging
        upstream.on('open', () => {
          // client -> upstream
          client.on('message', (msg) => {
            if (upstream.readyState === WS.OPEN) upstream.send(msg);
          });
          // upstream -> client
          upstream.on('message', (msg) => {
            if (client.readyState === WS.OPEN) client.send(msg);
          });
        });

        upstream.on('close', (code, reason) => {
          if (client.readyState === WS.OPEN) client.close(code, reason);
        });
        upstream.on('error', () => {
          if (client.readyState === WS.OPEN) client.close(4502, 'upstream error');
        });
        client.on('close', () => {
          if (upstream.readyState === WS.OPEN || upstream.readyState === WS.CONNECTING) {
            upstream.close();
          }
        });
        client.on('error', () => {
          if (upstream.readyState === WS.OPEN) upstream.close();
        });
      });
      return; // do NOT fall through to pty path
    }

    // -- Local mode (VPS direct) ------------------------------------------------
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
      // Keepalive: ping every 20s to prevent proxy idle-connection kills (TERM-01)
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      const keepalive = setInterval(() => {
        if (ws.readyState !== ws.OPEN) { clearInterval(keepalive); return; }
        if (!ws.isAlive) { ws.terminate(); clearInterval(keepalive); return; }
        ws.isAlive = false;
        ws.ping();
      }, 20000);

      let pty;
      try {
        pty = require('node-pty').spawn('tmux', ['attach-session', '-t', session], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: process.env.HOME || '/',
        });
      } catch {
        clearInterval(keepalive);
        ws.close(4005, 'node-pty unavailable');
        return;
      }

      // 16ms PTY output batching -- accumulate output into a buffer and flush once per frame (60fps).
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
        clearInterval(keepalive);
        if (flushTimer) { clearTimeout(flushTimer); flushPty(); }
        if (ws.readyState === 1) ws.close(1000, 'pty exited');
      });

      ws.on('close', () => {
        clearInterval(keepalive);
        if (flushTimer) { clearTimeout(flushTimer); flushPty(); }
        try { pty.kill(); } catch {}
      });
    });
  });
}

module.exports = { attachTerminalWS };
