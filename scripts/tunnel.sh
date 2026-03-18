#!/usr/bin/env bash
# Starts a cloudflared quick tunnel -> localhost:4820.
# Captures the assigned URL and updates Railway's GSD_DATA_URL, then
# triggers a redeploy so Railway always proxies to the current tunnel.
# Loops forever, restarting on failure (for use as a systemd service).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
LOCAL_PORT="${DASHBOARD_PORT:-4820}"
LOG_FILE="/tmp/gsd-tunnel.log"
RAILWAY_PROJECT_ID="2415b1c4-c414-4d3c-bd13-6ca1d5ed3750"
RAILWAY_SERVICE_ID="7952eac2-f76c-4734-a18c-b8608f53a891"

# Load env file
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG_FILE"; }

RAILWAY_ENV_ID="cc4aaab8-1963-4351-bdf6-e62a0e665ebc"
RAILWAY_GQL="https://backboard.railway.app/graphql/v2"

gql() {
  local query="$1"
  curl -sf -X POST "$RAILWAY_GQL" \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data-raw "{\"query\":\"$query\"}" >> "$LOG_FILE" 2>&1 || true
}

update_railway() {
  local url="$1"
  log "Setting GSD_DATA_URL=$url on Railway..."
  gql "mutation { variableCollectionUpsert(input: { projectId: \\\"$RAILWAY_PROJECT_ID\\\", serviceId: \\\"$RAILWAY_SERVICE_ID\\\", environmentId: \\\"$RAILWAY_ENV_ID\\\", variables: { GSD_DATA_URL: \\\"$url\\\" } }) }"

  log "Triggering Railway redeploy..."
  gql "mutation { serviceInstanceRedeploy(serviceId: \\\"$RAILWAY_SERVICE_ID\\\", environmentId: \\\"$RAILWAY_ENV_ID\\\") }"
}

while true; do
  TMP_LOG=$(mktemp)
  log "Starting cloudflared tunnel -> localhost:$LOCAL_PORT"

  # Start tunnel in background
  cloudflared tunnel --url "http://localhost:$LOCAL_PORT" --no-autoupdate >"$TMP_LOG" 2>&1 &
  CF_PID=$!

  # Wait up to 30s for URL to appear
  TUNNEL_URL=""
  for i in $(seq 1 30); do
    TUNNEL_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "$TMP_LOG" 2>/dev/null | head -1 || true)
    [[ -n "$TUNNEL_URL" ]] && break
    sleep 1
  done

  if [[ -n "$TUNNEL_URL" ]]; then
    log "Tunnel URL: $TUNNEL_URL"
    update_railway "$TUNNEL_URL"
    log "Railway updated. Tunnel running (PID $CF_PID)."
  else
    log "ERROR: No tunnel URL detected within 30s"
  fi

  # Block until tunnel dies
  wait "$CF_PID" || true
  rm -f "$TMP_LOG"
  log "Tunnel exited. Restarting in 30s..."
  sleep 30
done
