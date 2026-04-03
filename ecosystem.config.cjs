module.exports = {
  apps: [
    {
      name: 'gsd-dashboard',
      script: 'server/index.js',
      cwd: '/data/home/gsddashboard',
      env: {
        NODE_ENV: 'production',
      },
      restart_delay: 3000,
      max_restarts: 50,
      autorestart: true,
    },
    {
      name: 'gsd-healthcheck',
      script: 'scripts/healthcheck.sh',
      cwd: '/data/home/gsddashboard',
      interpreter: '/bin/sh',
      autorestart: true,
      restart_delay: 10000,
      max_restarts: 10,
    },
    {
      name: 'gsd-tunnel',
      script: 'scripts/tunnel.sh',
      cwd: '/data/home/gsddashboard',
      interpreter: '/bin/sh',
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
    },
  ],
};
