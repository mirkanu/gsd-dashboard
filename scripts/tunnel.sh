#!/usr/bin/env sh
# Named Cloudflare Tunnel launcher for GSD Dashboard.
#
# This uses a named Cloudflare Tunnel — the URL is permanent.
# Run scripts/tunnel-setup.sh first to create the tunnel and configure DNS.
# Set CLOUDFLARE_TUNNEL_NAME in .env before running.
# Set GSD_DATA_URL=https://your-hostname on Railway (one-time only — the URL never changes).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
LOG_FILE="/tmp/gsd-tunnel.log"

# Load env file
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

DASHBOARD_PORT="${DASHBOARD_PORT:-4820}"

if [ -z "${CLOUDFLARE_TUNNEL_NAME:-}" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR: CLOUDFLARE_TUNNEL_NAME is not set. Set it in .env or the environment." >&2
  exit 1
fi

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG_FILE"; }

while true; do
  log "Starting named tunnel '$CLOUDFLARE_TUNNEL_NAME' -> localhost:$DASHBOARD_PORT"
  cloudflared tunnel --no-autoupdate run --url "http://localhost:$DASHBOARD_PORT" "$CLOUDFLARE_TUNNEL_NAME"
  log "Tunnel exited (code $?). Restarting in 15s..."
  sleep 15
done
