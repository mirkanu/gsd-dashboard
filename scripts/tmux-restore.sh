#!/usr/bin/env bash
# tmux-restore.sh — restores tmux sessions from ~/.tmux-sessions on login
set -euo pipefail

SAVE_DIR="$HOME/.tmux-sessions"

if [[ ! -f "$SAVE_DIR/sessions.list" ]]; then
  echo "tmux-restore: no saved sessions found at $SAVE_DIR/sessions.list" >&2
  exit 0
fi

restored=0
while IFS= read -r session; do
  [[ -z "$session" ]] && continue
  # Skip if session already exists
  if tmux has-session -t "$session" 2>/dev/null; then
    echo "tmux-restore: session '$session' already exists, skipping."
    continue
  fi
  # Determine start directory from first window entry if available
  start_dir="$HOME"
  win_file="$SAVE_DIR/${session}.windows"
  if [[ -f "$win_file" ]]; then
    first_path=$(awk 'NR==1{print $3}' "$win_file")
    [[ -d "$first_path" ]] && start_dir="$first_path"
  fi
  tmux new-session -d -s "$session" -c "$start_dir"
  echo "tmux-restore: created session '$session' in $start_dir"
  ((restored++)) || true
done < "$SAVE_DIR/sessions.list"

echo "tmux-restore: restored $restored session(s)."
