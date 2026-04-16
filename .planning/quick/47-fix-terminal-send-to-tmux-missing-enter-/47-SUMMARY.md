---
phase: quick-47
plan: 01
subsystem: terminal
tags: [tmux, mobile, terminal, ios, send-keys]
dependency_graph:
  requires: []
  provides: [reliable-tmux-text-input, ios-keyboard-control]
  affects: [server/routes/gsd.js, client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [tmux-send-keys-literal-flag, wasFocused-guard-pattern]
key_files:
  modified:
    - server/routes/gsd.js
    - client/src/pages/GSD.tsx
decisions:
  - "tmux send-keys -l flag sends text literally so key names like 'Enter', 'Space', 'Escape' in user text are never intercepted by tmux"
  - "Enter sent as a separate non-literal send-keys call so it IS interpreted as the key, not literal text"
  - "wasFocused guard checks document.activeElement.classList.contains('xterm-helper-textarea') before calling focus() — keeps iOS keyboard open only if user was already typing"
metrics:
  duration: ~8min
  completed: 2026-04-16
  tasks: 2
  files: 2
---

# Quick Task 47: Fix Terminal Send-to-tmux and iOS Keyboard Summary

**One-liner:** Fixed tmux send-keys to use -l literal flag plus separate Enter call, and added wasFocused guard in SpecialKeyBar to prevent unwanted iOS keyboard focus.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix tmux send-keys to use -l flag for literal text | efd30da | server/routes/gsd.js |
| 2 | Guard terminal focus() in shortcut bar to prevent unwanted iOS keyboard | abf19db | client/src/pages/GSD.tsx |

## Changes Made

### Task 1 — server/routes/gsd.js (lines ~299-301)

**Before:**
```js
// large-text path
execFileSync('tmux', ['send-keys', '-t', tmux_session, '', 'Enter'], { stdio: 'ignore' });
// normal-text path
execFileSync('tmux', ['send-keys', '-t', tmux_session, text, 'Enter'], { stdio: 'ignore' });
```

**After:**
```js
// large-text path: remove meaningless empty-string arg
execFileSync('tmux', ['send-keys', '-t', tmux_session, 'Enter'], { stdio: 'ignore' });
// normal-text path: -l sends text literally, separate call for Enter key
execFileSync('tmux', ['send-keys', '-t', tmux_session, '-l', text], { stdio: 'ignore' });
execFileSync('tmux', ['send-keys', '-t', tmux_session, 'Enter'], { stdio: 'ignore' });
```

Without `-l`, tmux interprets the text argument as a sequence of key names. A word like "Enter" typed by the user would be sent as the Return key, "Space" as a space, "Escape" as Escape, etc. The `-l` flag treats the string as literal characters.

### Task 2 — client/src/pages/GSD.tsx (SpecialKeyBar.onTouchStart)

Added `wasFocused` check before `termRef.current?.focus()`. The xterm input element always has class `xterm-helper-textarea`. By capturing `document.activeElement?.classList.contains('xterm-helper-textarea')` before `e.preventDefault()` clears focus, we know if the user was actively typing. Only in that case do we re-focus, preserving the keyboard. When terminal was not focused, the key sequence is still sent via WebSocket but the iOS keyboard is not opened.

## Verification

- `npm run test:server`: all send-related tests pass; 4 pre-existing unrelated failures unchanged
- `npm run test:client`: GSD filter tests pass (7/7); pre-existing React production-mode failures in AgentCard/EmptyState/etc. unchanged

## Deviations from Plan

None — plan executed exactly as written.
