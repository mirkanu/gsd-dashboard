#!/usr/bin/env sh
# Named Cloudflare Tunnel launcher for GSD Dashboard.
# Runs the pre-configured named tunnel 'gsd-dashboard' via cloudflared.
# Supervised by PM2 (gsd-tunnel); PM2 handles restarts on crash.

set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$ROOT/logs/gsd-tunnel.log"

mkdir -p "$ROOT/logs" 2>/dev/null || true

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG_FILE"; }

log "Starting named Cloudflare tunnel (gsd-dashboard)..."

# cloudflared tunnel run keeps the process in the foreground.
# PM2 restarts it on exit.
# Config lives in non-standard path set during Phase 62 tunnel setup.
exec cloudflared --config /root/.cloudflare-tunnel/config.yml tunnel run 2>&1 | tee -a "$LOG_FILE"
