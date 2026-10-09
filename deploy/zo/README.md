# gsd-dashboard on Zo Computer

This directory holds the templates and notes for running gsd-dashboard
as a private Zo Site at `https://gsd-dashboard-mirkanu.zo.computer/`.

The dashboard itself stays in the `mirkanu/gsd-dashboard` GitHub repo;
this folder just gives the operator everything they need on the Zo host
without having to remember the env-var wiring.

## What you need on the Zo host

- Node.js 22+ (the dashboard's `better-sqlite3` / `node:sqlite` fallback
  won't build on older Node)
- `tmux` on `$PATH` (apt-get install tmux) — the GUI button starts
  Claude by spawning `claude` inside a tmux session and the terminal
  panel attaches to it via `node-pty`
- Claude Code installed and on `$PATH` (the GUI's "Start Claude" button
  shells out to `claude`; the dashboard itself does not vendor Claude)
- Optional: `node-pty`'s build deps (Python 3, `make`, `g++`) — needed
  to compile the native module on first install

## Layout

```
/home/workspace/
├── .gsd-dashboard/                    # data dir (GSD_DATA_DIR) — durable
│   ├── .env                            # copied from .env.example
│   ├── gsd-projects.json               # projects the dashboard tracks
│   ├── data/
│   │   └── dashboard.db                # SQLite
│   └── uploads/                        # file artefacts
└── .z/workspaces/<session>/gsd-dashboard/   # clone of mirkanu/gsd-dashboard
```

The repo clone lives in a per-session scratch directory; the data dir
is durable and survives restarts. Re-cloning the repo never wipes
project bindings.

## One-time setup

```sh
# 1. Install system + global tools
apt-get update && apt-get install -y tmux
# Install Claude Code (https://docs.claude.com/claude-code) if not already on PATH

# 2. Make the data dir and seed the env file
mkdir -p /home/workspace/.gsd-dashboard/{data,uploads}
cp deploy/zo/.env.example /home/workspace/.gsd-dashboard/.env
# Edit it: set DASHBOARD_PASS to a strong random string
$EDITOR /home/workspace/.gsd-dashboard/.env

# 3. Install deps (in a fresh clone of the repo)
cd /path/to/gsd-dashboard   # session workspace clone
npm install --include=optional    # node-pty is in optionalDependencies

# 4. Seed the project bindings
cat > /home/workspace/.gsd-dashboard/gsd-projects.json <<'JSON'
{
  "projects": [
    { "name": "psalter", "root": "/home/workspace/psalter", "tmux_session": "psalter" }
  ]
}
JSON
```

## Running as a Zo Site

The repo does not match the Vite SPA template `create_website` produces,
so it runs as a managed user_service instead:

```sh
register_user_service \
  --label gsd-dashboard \
  --mode http \
  --local_port 4820 \
  --entrypoint 'bash -lc "cd /home/.z/workspaces/<session>/gsd-dashboard && set -a; . /home/workspace/.gsd-dashboard/.env; set +a; exec node server/index.js"' \
  --env_vars '{}' \
  --public false
```

Replace `<session>` with the active conversation ID. The `set -a; .env;
set +a` pattern exports the vars into the dashboard's process. The
service runs on the loopback port and is exposed to the public Zo host
at `https://gsd-dashboard-mirkanu.zo.computer/` via the standard
`*.zo.computer` private-site hostname (no publishing step needed —
the hostname is bound to the service's local_port on first start).

## Operational notes

- Health: `curl -s http://127.0.0.1:4820/api/health` — the dashboard
  exposes a small JSON ping. Use this for monitoring.
- Logs: `/dev/shm/gsd-dashboard.log` (stdout) and
  `/dev/shm/gsd-dashboard_err.log` (stderr) once the service is
  registered.
- Updates: pull the repo in the session workspace, `npm install`, then
  `update_user_service gsd-dashboard` (no other args) to restart.
- The `install-hooks` npm script is a no-op on Zo (we wire Claude Code
  to the dashboard via `scripts/hook-handler.js` at registration time
  instead — see the CLAUDE_CODE_HOOKS_* vars in `.env.example` once
  the docs in `INSTALL.md` are updated).
