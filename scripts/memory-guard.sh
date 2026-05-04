#!/usr/bin/env bash
# memory-guard.sh — checks RAM pressure and kills hung node --test processes
# Logs to /home/claude/.pm2/logs/memory-guard.log

set -euo pipefail

LOG_FILE="/home/claude/.pm2/logs/memory-guard.log"
THRESHOLD_MB=400
MAX_TEST_MINUTES=10

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# ── 1. Check available RAM ────────────────────────────────────────────────────
avail_kb=$(grep '^MemAvailable:' /proc/meminfo | awk '{print $2}')
avail_mb=$(( avail_kb / 1024 ))

if (( avail_mb < THRESHOLD_MB )); then
  log "WARNING: Available RAM is ${avail_mb}MB (below ${THRESHOLD_MB}MB threshold). OOM risk."
else
  log "INFO: RAM OK — ${avail_mb}MB available."
fi

# ── 2. Kill hung node --test processes older than MAX_TEST_MINUTES ────────────
hung_pids=$(ps -eo pid,etimes,user,args --no-headers \
  | awk -v max=$(( MAX_TEST_MINUTES * 60 )) \
    '$2 >= max && $4 == "node" && $5 == "--test" {print $1, $3, $4, $5}' \
  || true)

if [[ -z "$hung_pids" ]]; then
  log "INFO: No hung node --test processes found."
else
  log "WARNING: Found hung node --test process(es):"
  while IFS= read -r line; do
    pid=$(echo "$line" | awk '{print $1}')
    owner=$(echo "$line" | awk '{print $2}')
    log "  PID=$pid owner=$owner"
    if [[ "$owner" == "root" ]] && [[ "$(whoami)" != "root" ]]; then
      log "  NOTICE: PID $pid is owned by root — run 'sudo kill $pid' manually to terminate."
    else
      if kill "$pid" 2>/dev/null; then
        log "  Killed PID $pid (owner=$owner)."
      else
        log "  Failed to kill PID $pid (owner=$owner) — may need sudo."
      fi
    fi
  done <<< "$hung_pids"
fi
