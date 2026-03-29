#!/usr/bin/env sh
# ngrok tunnel launcher for GSD Dashboard.
#
# Uses a free static ngrok domain — the URL is permanent.
# Requires: ngrok authtoken configured (ngrok config add-authtoken <token>)
# Set NGROK_DOMAIN in .env before running.
# Set GSD_DATA_URL=https://<domain> on Railway (one-time only — the URL never changes).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
LOG_FILE="/tmp/gsd-tunnel.log"

# Load env file
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

DASHBOARD_PORT="${DASHBOARD_PORT:-4820}"
NGROK_BIN="${NGROK_BIN:-/data/home/.local/bin/ngrok}"

if [ -z "${NGROK_DOMAIN:-}" ]; then
  echo "[$(date -u +%FT%TZ)] ERROR: NGROK_DOMAIN is not set. Set it in .env or the environment." >&2
  exit 1
fi

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG_FILE"; }

while true; do
  log "Starting ngrok tunnel '$NGROK_DOMAIN' -> localhost:$DASHBOARD_PORT"
  "$NGROK_BIN" http "$DASHBOARD_PORT" --domain="$NGROK_DOMAIN" --log "$LOG_FILE"
  log "Tunnel exited (code $?). Restarting in 15s..."
  sleep 15
done
