#!/usr/bin/env sh
# Tailscale Funnel launcher for GSD Dashboard.
#
# Replaces the previous ngrok wrapper (retired 2026-04-10 after ERR_NGROK_725
# bandwidth exhaustion on the free tier).
#
# This script is supervised by PM2 (gsd-tunnel) and handles:
#   1. Starting tailscaled (userspace networking) if it isn't already running
#   2. Applying `tailscale serve` + `tailscale funnel` config idempotently
#   3. Supervising the config — if funnel state is lost, re-register
#
# Prereqs (one-time, already done as of 2026-04-10):
#   - tailscale installed (`curl -fsSL https://tailscale.com/install.sh | sh`)
#   - `sudo tailscale up` completed with user approval
#   - Funnel enabled for this tailnet via admin ACL nodeAttrs
#   - Passwordless sudo configured for the dashboard user
#
# Env:
#   - DASHBOARD_PORT        (default 4820)
#   - TAILSCALE_FUNNEL_URL  (informational — used by Railway's GSD_DATA_URL)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
LOG_FILE="/data/home/gsddashboard/logs/gsd-tunnel.log"
TS_SOCKET="/var/run/tailscale/tailscaled.sock"
TS_STATE="/var/lib/tailscale/tailscaled.state"
TS_LOG="/tmp/tailscaled.log"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

DASHBOARD_PORT="${DASHBOARD_PORT:-4820}"

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG_FILE"; }

ts() { sudo -n tailscale --socket="$TS_SOCKET" "$@"; }

ensure_tailscaled() {
  # Is the daemon reachable via the socket?
  if ts status >/dev/null 2>&1; then
    return 0
  fi

  log "tailscaled not reachable on $TS_SOCKET — starting it (userspace mode)"
  sudo -n mkdir -p "$(dirname "$TS_SOCKET")" "$(dirname "$TS_STATE")" 2>/dev/null || true
  # Background the daemon; logs go to $TS_LOG
  sudo -n sh -c "nohup /usr/sbin/tailscaled \
    --tun=userspace-networking \
    --state=$TS_STATE \
    --socket=$TS_SOCKET \
    >>$TS_LOG 2>&1 &"

  # Wait up to 15s for the socket
  i=0
  while [ $i -lt 15 ]; do
    if ts status >/dev/null 2>&1; then
      log "tailscaled is up"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done

  log "ERROR: tailscaled failed to come up within 15s (see $TS_LOG)"
  return 1
}

apply_funnel_config() {
  # Both commands are idempotent: re-running is a no-op if already set.
  log "Applying serve + funnel config for localhost:$DASHBOARD_PORT"
  ts serve --bg "http://localhost:$DASHBOARD_PORT" >>"$LOG_FILE" 2>&1 || {
    log "tailscale serve --bg failed (code $?)"
    return 1
  }
  ts funnel --bg --https=443 "http://localhost:$DASHBOARD_PORT" >>"$LOG_FILE" 2>&1 || {
    log "tailscale funnel --bg failed (code $?)"
    return 1
  }
  log "Funnel registered -> https://<host>/ => http://localhost:$DASHBOARD_PORT"
  return 0
}

funnel_still_healthy() {
  # Check funnel status contains our port; if not, we need to re-apply.
  ts funnel status 2>/dev/null | grep -q "localhost:$DASHBOARD_PORT"
}

while true; do
  if ! ensure_tailscaled; then
    log "Retrying tailscaled bootstrap in 15s..."
    sleep 15
    continue
  fi

  if ! apply_funnel_config; then
    log "Config apply failed. Retrying in 15s..."
    sleep 15
    continue
  fi

  # Supervise — poll every 30s; re-apply if funnel config is lost.
  while funnel_still_healthy; do
    sleep 30
  done

  log "Funnel config lost. Re-applying..."
done
