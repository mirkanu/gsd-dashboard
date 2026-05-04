#!/usr/bin/env bash
# tmux-save.sh — saves current tmux session list and window layouts to ~/.tmux-sessions
set -euo pipefail

SAVE_DIR="$HOME/.tmux-sessions"
mkdir -p "$SAVE_DIR"

if ! tmux list-sessions &>/dev/null; then
  echo "tmux-save: no sessions running, skipping." >&2
  exit 0
fi

tmux list-sessions -F '#{session_name}' > "$SAVE_DIR/sessions.list"

while IFS= read -r session; do
  tmux list-windows -t "$session" \
    -F '#{window_index} #{window_name} #{pane_current_path}' \
    > "$SAVE_DIR/${session}.windows" 2>/dev/null || true
done < "$SAVE_DIR/sessions.list"

date -Iseconds > "$SAVE_DIR/last-save"
echo "tmux-save: saved $(wc -l < "$SAVE_DIR/sessions.list") sessions at $(cat "$SAVE_DIR/last-save")"
