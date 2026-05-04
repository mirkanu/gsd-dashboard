const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'gsd-dashboard',
      script: path.join(ROOT, 'server/index.js'),
      cwd: ROOT,
      env: {
        NODE_ENV: 'production',
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
