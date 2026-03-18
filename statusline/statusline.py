import sys
import json
import os
import subprocess

sys.stdout.reconfigure(encoding='utf-8')

CYAN    = '\033[0;36m'
GREEN   = '\033[0;32m'
YELLOW  = '\033[0;33m'
MAGENTA = '\033[0;35m'
RED     = '\033[0;31m'
DIM     = '\033[2m'
RESET   = '\033[0m'

raw = sys.stdin.read().strip()
if not raw:
    sys.exit(0)

try:
    data = json.loads(raw)
except Exception:
    sys.exit(0)

parts = []

# Model
model = (data.get('model') or {}).get('display_name', '')
if model:
    parts.append(f"{CYAN}{model}{RESET}")

# User
user = os.environ.get('USERNAME') or os.environ.get('USER', '')
if user:
    parts.append(f"{GREEN}{user}{RESET}")

# CWD — strip home prefix
cwd = (data.get('workspace') or {}).get('current_dir') or data.get('cwd', '')
if cwd:
    home = os.path.expanduser('~')  # C:\Users\nguyens6
    if cwd.startswith(home):
        cwd = '~' + cwd[len(home):].replace('\\', '/')
    else:
        cwd = cwd.replace('\\', '/')
    parts.append(f"{YELLOW}{cwd}{RESET}")

# Git branch
git_dir = (data.get('workspace') or {}).get('current_dir') or data.get('cwd', '')
if git_dir:
    try:
        branch = subprocess.check_output(
            ['git', '-C', git_dir, '--no-optional-locks', 'symbolic-ref', '--short', 'HEAD'],
            stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        try:
            branch = subprocess.check_output(
                ['git', '-C', git_dir, '--no-optional-locks', 'rev-parse', '--short', 'HEAD'],
                stderr=subprocess.DEVNULL
            ).decode().strip()
        except Exception:
            branch = ''
    if branch:
        parts.append(f"{MAGENTA}{branch}{RESET}")

# Context bar
ctx = data.get('context_window') or {}
used_pct = ctx.get('used_percentage')
if used_pct is not None:
    bar_len = 10
    filled = round(bar_len * used_pct / 100)
    bar = '█' * filled + '░' * (bar_len - filled)
    color = RED if used_pct >= 80 else YELLOW if used_pct >= 50 else GREEN
    parts.append(f"{color}{bar} {used_pct}%{RESET}")

# Tokens
usage = ctx.get('current_usage') or {}
in_tok  = usage.get('input_tokens')
out_tok = usage.get('output_tokens')
cache   = usage.get('cache_read_input_tokens')
if in_tok is not None and out_tok is not None:
    tok_str = f"{in_tok}↑ {out_tok}↓"
    if cache:
        tok_str += f" {cache}c"
    parts.append(f"{DIM}{tok_str}{RESET}")

sep = f"{DIM} | {RESET}"
print(sep.join(parts))
