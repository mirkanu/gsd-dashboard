#!/usr/bin/env bash
# tmux-watchdog.sh — detects a dead/partially-dead tmux server and restores any
# missing session (with claude --dangerously-skip-permissions relaunched in window 0)
# by comparing live tmux sessions against the last tmux-save.sh snapshot.
# Run every 90s via tmux-watchdog.timer.
set -euo pipefail

LOG_FILE="/home/claude/.pm2/logs/tmux-watchdog.log"
SAVE_DIR="$HOME/.tmux-sessions"
RESTORE_SCRIPT="/home/services/gsddashboard/scripts/tmux-restore.sh"

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

mkdir -p "$(dirname "$LOG_FILE")"

if [[ ! -f "$SAVE_DIR/sessions.list" ]]; then
  log "no snapshot found yet, nothing to protect"
  exit 0
fi

mapfile -t raw_expected < "$SAVE_DIR/sessions.list"
expected=()
for s in "${raw_expected[@]}"; do
  [[ -n "$s" ]] && expected+=("$s")
done

live_raw="$(tmux list-sessions -F '#{session_name}' 2>/dev/null || true)"
declare -A live_set
if [[ -n "$live_raw" ]]; then
  while IFS= read -r s; do
    [[ -n "$s" ]] && live_set["$s"]=1
  done <<< "$live_raw"
fi

missing=()
for s in "${expected[@]}"; do
  if [[ -z "${live_set[$s]:-}" ]]; then
    missing+=("$s")
  fi
done

total=${#expected[@]}
if [[ ${#missing[@]} -eq 0 ]]; then
  log "OK: ${total}/${total} expected sessions present"
  exit 0
fi

log "DETECTED GAP: missing session(s): ${missing[*]} — invoking restore"
"$RESTORE_SCRIPT" --with-claude >> "$LOG_FILE" 2>&1 || true

live_raw="$(tmux list-sessions -F '#{session_name}' 2>/dev/null || true)"
declare -A live_set2
if [[ -n "$live_raw" ]]; then
  while IFS= read -r s; do
    [[ -n "$s" ]] && live_set2["$s"]=1
  done <<< "$live_raw"
fi

present=0
for s in "${expected[@]}"; do
  if [[ -n "${live_set2[$s]:-}" ]]; then
    ((present++)) || true
  fi
done

log "restore result: ${present}/${total} expected sessions now present"
