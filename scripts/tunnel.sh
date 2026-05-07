#!/usr/bin/env sh
# Cloudflare Tunnel launcher for GSD Dashboard.
# Phase 62: Railway sync removed — GSD_DATA_URL is now fixed at dashboard.gsdlabs.dev
#
# Replaces the previous Tailscale Funnel wrapper (retired 2026-04-11 after
# latency testing showed 1-10s per proxied request and frequent 502 timeouts
# through the Railway -> Funnel path). Cloudflare quick tunnels ("trycloudflare")
# clock in at ~100-170ms per request, matching the previous ngrok baseline, with
# no bandwidth caps.
#
# This script is supervised by PM2 (gsd-tunnel) and handles:
#   1. Running `cloudflared tunnel --url http://localhost:$DASHBOARD_PORT`
#   2. Parsing the generated *.trycloudflare.com URL from cloudflared stdout/stderr
#   3. Writing the URL to $ROOT/.tunnel-url (for ops/debugging)
#   4. Keeping cloudflared in the foreground so PM2 restarts on crash
#
# Prereqs:
#   - /usr/local/bin/cloudflared installed (Debian package, version 2026.3.0+)
#
# Env:
#   - DASHBOARD_PORT (default 4820)

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env"
LOG_FILE="$ROOT/logs/gsd-tunnel.log"
URL_FILE="$ROOT/.tunnel-url"
CF_RAW_LOG="$ROOT/logs/cloudflared-raw.log"

mkdir -p "$ROOT/logs" 2>/dev/null || true

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

DASHBOARD_PORT="${DASHBOARD_PORT:-4820}"

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG_FILE"; }

log "Starting cloudflared quick tunnel -> http://localhost:$DASHBOARD_PORT"

# Truncate raw log on each start so URL parsing is deterministic.
: > "$CF_RAW_LOG"

# Launch cloudflared in background, combining stdout+stderr into the raw log.
cloudflared tunnel --url "http://localhost:$DASHBOARD_PORT" --no-autoupdate \
  >>"$CF_RAW_LOG" 2>&1 &
CF_PID=$!

log "cloudflared PID: $CF_PID"

# Poll the raw log for the trycloudflare URL (usually appears within ~5s).
URL=""
i=0
while [ $i -lt 60 ]; do
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    log "cloudflared exited before URL appeared. Last 20 lines of raw log:"
    tail -n 20 "$CF_RAW_LOG" | tee -a "$LOG_FILE"
    exit 1
  fi
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_RAW_LOG" | head -1 || true)"
  if [ -n "$URL" ]; then
    break
  fi
  sleep 1
  i=$((i + 1))
done

if [ -z "$URL" ]; then
  log "Timed out waiting for trycloudflare URL after 60s. Killing cloudflared."
  kill "$CF_PID" 2>/dev/null || true
  tail -n 20 "$CF_RAW_LOG" | tee -a "$LOG_FILE"
  exit 1
fi

printf '%s\n' "$URL" > "$URL_FILE"
log "New tunnel URL: $URL (Railway sync disabled — GSD_DATA_URL is fixed at dashboard.gsdlabs.dev)"

# Tail cloudflared raw log into the main log so PM2 logs show ongoing activity.
tail -n 0 -F "$CF_RAW_LOG" >>"$LOG_FILE" 2>&1 &
TAIL_PID=$!

# Clean shutdown: if cloudflared dies, we exit with its code so PM2 restarts us.
trap 'kill $TAIL_PID 2>/dev/null || true; kill $CF_PID 2>/dev/null || true' INT TERM

wait "$CF_PID"
RC=$?
kill "$TAIL_PID" 2>/dev/null || true
log "cloudflared exited (code $RC) — PM2 will restart us"
exit $RC
