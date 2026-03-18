# Claude Code Statusline

A color-coded statusline for Claude Code showing model, user, working directory, git branch, context window usage, and token counts.

## Preview

```
Sonnet 4.6 | nguyens6 | ~/agent-dashboard/client | main | ████████░░ 79% | 3↑ 2↓ 156586c
```

| Segment     | Color                | Example                                            |
| ----------- | -------------------- | -------------------------------------------------- |
| Model       | Cyan                 | `Sonnet 4.6`                                       |
| User        | Green                | `nguyens6`                                         |
| CWD         | Yellow               | `~/agent-dashboard/client`                         |
| Git branch  | Magenta              | `main` (hidden outside git repos)                  |
| Context bar | Green → Yellow → Red | `████████░░ 79%`                                   |
| Tokens      | Dim                  | `3↑ 2↓ 156586c` (`↑` in, `↓` out, `c` cache reads) |

Context bar color thresholds:

- **Green** — under 50% used
- **Yellow** — 50–79% used
- **Red** — 80%+ used

## Requirements

- Python 3.6+
- Git (for branch detection)
- Claude Code 2.x+

## Installation

**1. Copy both files into your Claude config directory:**

```bash
# macOS / Linux
cp statusline.py ~/.claude/statusline.py
cp statusline-command.sh ~/.claude/statusline-command.sh
chmod +x ~/.claude/statusline-command.sh

# Windows (Git Bash)
cp statusline.py "$HOME/.claude/statusline.py"
cp statusline-command.sh "$HOME/.claude/statusline-command.sh"
```

**2. Update the path in `statusline-command.sh`:**

Open `~/.claude/statusline-command.sh` and replace the path with your own home directory:

```bash
#!/usr/bin/env bash
PYTHONUTF8=1 python3 "/your/home/.claude/statusline.py"
```

On Windows this looks like:

```bash
#!/usr/bin/env bash
PYTHONUTF8=1 python3 "C:/Users/YOUR_USERNAME/.claude/statusline.py"
```

On macOS/Linux:

```bash
#!/usr/bin/env bash
python3 "$HOME/.claude/statusline.py"
```

**3. Add to `~/.claude/settings.json`:**

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"/path/to/home/.claude/statusline-command.sh\""
  }
}
```

Windows example:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"C:/Users/YOUR_USERNAME/.claude/statusline-command.sh\""
  }
}
```

macOS/Linux example:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"/home/YOUR_USERNAME/.claude/statusline-command.sh\""
  }
}
```

**4. Reload Claude Code** — close and reopen, or run `/reload`.

## How It Works

Claude Code pipes a JSON object to the statusline command's stdin on each update. The script reads that JSON, extracts the relevant fields, and prints a color-coded string using ANSI escape codes.

Key fields used from the JSON payload:

```json
{
  "model": { "display_name": "Sonnet 4.6" },
  "workspace": { "current_dir": "C:\\Users\\..." },
  "context_window": {
    "used_percentage": 79,
    "current_usage": {
      "input_tokens": 3,
      "output_tokens": 2,
      "cache_read_input_tokens": 156586
    }
  }
}
```

## Customization

Edit `statusline.py` directly to change colors, reorder segments, or remove ones you don't want. Each segment is clearly labeled with a comment.

Color constants at the top of the file:

```python
CYAN    = '\033[0;36m'
GREEN   = '\033[0;32m'
YELLOW  = '\033[0;33m'
MAGENTA = '\033[0;35m'
RED     = '\033[0;31m'
DIM     = '\033[2m'
```
