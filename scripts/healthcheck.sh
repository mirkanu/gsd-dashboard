#!/usr/bin/env sh
# Health check loop — restarts gsd-dashboard via pm2 if it stops responding.
# Runs every 30s. If 3 consecutive checks fail, force-restarts.

PM2="/data/home/.local/bin/pm2"
URL="http://localhost:4820/api/health"
FAIL_COUNT=0
MAX_FAILS=3

while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "$URL" 2>/dev/null)
  if [ "$STATUS" = "200" ]; then
    FAIL_COUNT=0
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "[$(date -u +%FT%TZ)] Health check failed ($FAIL_COUNT/$MAX_FAILS) — HTTP $STATUS"
    if [ "$FAIL_COUNT" -ge "$MAX_FAILS" ]; then
      echo "[$(date -u +%FT%TZ)] Restarting gsd-dashboard..."
      # Kill the process hard first in case it's hung
      PID=$($PM2 pid gsd-dashboard 2>/dev/null)
      if [ -n "$PID" ] && [ "$PID" != "0" ]; then
        kill -9 "$PID" 2>/dev/null
        sleep 2
      fi
      $PM2 restart gsd-dashboard 2>/dev/null || $PM2 start /data/home/gsddashboard/ecosystem.config.cjs --only gsd-dashboard 2>/dev/null
      FAIL_COUNT=0
      sleep 10  # give it time to start
    fi
  fi
  sleep 30
done
