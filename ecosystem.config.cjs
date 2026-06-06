const path = require('path');
const fs = require('fs');
const ROOT = __dirname;

// Parse /home/services/.env.production into an object
function loadEnv(filePath) {
  try {
    return Object.fromEntries(
      fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .filter(line => line && !line.startsWith('#') && line.includes('='))
        .map(line => {
          const idx = line.indexOf('=');
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        })
    );
  } catch { return {}; }
}

const sharedEnv = loadEnv('/home/services/.env.production');

module.exports = {
  apps: [
    {
      name: 'gsd-dashboard',
      script: path.join(ROOT, 'server/index.js'),
      cwd: ROOT,
      env: {
        NODE_ENV: 'production',
        ...sharedEnv,
      },
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      max_restarts: 50,
      min_uptime: '10s',
      kill_timeout: 5000,
      autorestart: true,
    },
    {
      name: 'gsd-healthcheck',
      script: path.join(ROOT, 'scripts/healthcheck.sh'),
      cwd: ROOT,
      interpreter: '/bin/sh',
      autorestart: true,
      restart_delay: 30000,
      max_restarts: 0,
      min_uptime: '5s',
    },
    {
      name: 'gsd-tunnel',
      script: path.join(ROOT, 'scripts/named-tunnel.sh'),
      cwd: ROOT,
      interpreter: '/bin/sh',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      max_restarts: 0,
      min_uptime: '10s',
      autorestart: true,
    },
  ],
};
