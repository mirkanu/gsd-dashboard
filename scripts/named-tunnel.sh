#!/usr/bin/env sh
# Named Cloudflare Tunnel launcher for GSD Dashboard.
# Runs the pre-configured named tunnel 'gsd-dashboard' via cloudflared.
# Supervised by PM2 (gsd-tunnel); PM2 handles restarts on crash.
# Phase 72: D-01 double-logging removed, D-02 log-level set to warn, D-07 truncate guard added.

set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$ROOT/logs/gsd-tunnel.log"

mkdir -p "$ROOT/logs" 2>/dev/null || true

# log() writes to stdout — PM2 captures stdout as the sole log sink (D-01: no pipe duplication)
log() { echo "[$(date -u +%FT%TZ)] $*"; }

# D-07: safety net — truncate project log file if it exceeds 10MB
if [ -f "$LOG_FILE" ]; then
  size=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$size" -gt 10485760 ]; then
    : > "$LOG_FILE"
    log "Safety truncated logs/gsd-tunnel.log (was $((size / 1024 / 1024))MB)"
  fi
fi

log "Starting named Cloudflare tunnel (gsd-dashboard)..."

# D-01: PM2 is the sole log sink — stdout only, no pipe duplication
# D-02: warn log-level suppresses heartbeat/metrics noise; --loglevel flag must precede 'tunnel run'
exec cloudflared --config /home/claude/.cloudflare-tunnel/config.yml --loglevel warn tunnel run
