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
      max_restarts: 50,
      autorestart: true,
    },
    {
      name: 'gsd-healthcheck',
      script: path.join(ROOT, 'scripts/healthcheck.sh'),
      cwd: ROOT,
      interpreter: '/bin/sh',
      autorestart: true,
      restart_delay: 10000,
      max_restarts: 10,
    },
    {
      name: 'gsd-tunnel',
      script: path.join(ROOT, 'scripts/named-tunnel.sh'),
      cwd: ROOT,
      interpreter: '/bin/sh',
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
    },
  ],
};
