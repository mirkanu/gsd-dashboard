---
phase: quick-9
plan: 9
subsystem: client-terminal
tags: [mobile, terminal, text-selection, clipboard, ux]
dependency_graph:
  requires: []
  provides: [mobile-text-selection-mode]
  affects: [client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [ref-for-event-handlers, select-mode-toggle]
key_files:
  created: []
  modified:
    - client/src/pages/GSD.tsx
decisions:
  - Use selectModeRef (not selectMode state) inside event handlers to avoid stale closure
  - Button shown on mobile only (isMobile check) — desktop has native text selection
  - Exiting select mode clears selection and refocuses terminal to restore scroll behavior
metrics:
  duration: "4 minutes"
  completed: "2026-03-31T14:20:00Z"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Quick Task 9: Enable Text Selection and Copy in Mobile Terminal

**One-liner:** Select mode toggle bypasses capture-phase touch handlers so xterm.js can perform native text selection and auto-copy on mobile.

## What Was Built

Added a "Select" mode toggle button to the terminal overlay header on mobile. When active, the button turns accent-highlighted and shows "Done". In select mode, the capture-phase touch event handlers that normally intercept all touches for tmux scroll yield to xterm.js, allowing the user to long-press and drag to select text. The existing `onSelectionChange` handler (line 283) auto-copies any selection to clipboard. Tapping "Done" clears the selection, restores terminal focus, and re-enables scroll behavior.

## Changes Made

### client/src/pages/GSD.tsx

**State and ref additions (~line 207):**
```typescript
const [selectMode, setSelectMode] = useState(false);
const selectModeRef = useRef(false); // ref for use inside event handlers (avoids stale closure)
```

**handleTouchMove early return:**
```typescript
const handleTouchMove = (e: TouchEvent) => {
  if (selectModeRef.current) return; // let xterm.js handle in select mode
  // ... rest unchanged
```

**handleTouchEnd early return:**
```typescript
const handleTouchEnd = () => {
  if (selectModeRef.current) return; // don't steal focus/clear selection
  if (!scrollIntent) terminal.focus();
};
```

**toggleSelectMode handler (after useEffects):**
```typescript
const toggleSelectMode = () => {
  const next = !selectMode;
  selectModeRef.current = next;
  setSelectMode(next);
  if (!next) {
    termRef.current?.clearSelection();
    termRef.current?.focus();
  }
};
```

**Header bar button (mobile only, left of X):**
```tsx
{isMobile && (
  <button
    onClick={toggleSelectMode}
    className={`text-xs px-2 py-1 rounded border transition-colors select-none ${
      selectMode
        ? 'bg-accent/20 text-accent border-accent/30'
        : 'bg-surface-3 text-gray-400 border-border hover:text-white'
    }`}
    aria-label={selectMode ? 'Exit select mode' : 'Enter select mode to copy text'}
  >
    {selectMode ? 'Done' : 'Select'}
  </button>
)}
```

## Verification

- `npm run test:client`: 106/108 tests pass (2 pre-existing unrelated Sidebar test failures)
- `npm run build`: TypeScript compilation clean, build successful

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | 8ee0e5f | feat(quick-9): add Select mode toggle for mobile text selection in terminal |

## Self-Check: PASSED

- client/src/pages/GSD.tsx modified and committed: FOUND
- Commit 8ee0e5f: FOUND
- Build passes: CONFIRMED
- Tests: 106 pass, 2 pre-existing failures unrelated to this change
