# Quick Task 28: Fix mobile terminal UX — Summary

**One-liner:** Prevent iOS keyboard auto-open on terminal load; info button now closes terminal before opening drawer.

## What Was Done

Two targeted fixes in `client/src/pages/GSD.tsx`:

1. **No auto-keyboard on mobile (line 323):** `terminal.focus()` now only runs on desktop (`pointer: fine`). On touch devices, the terminal renders without focus — user taps to activate when ready. The existing `handleTouchEnd` listener handles tap-to-focus.

2. **Info button closes terminal (line 1162):** `onInfo` callback now calls `setSelectedProject(null)` before `setDrawerProject(proj)`, so the terminal unmounts and the drawer is visible on top.

## Key Changes

| File | Change |
|------|--------|
| `client/src/pages/GSD.tsx:323` | Guard `terminal.focus()` behind `pointer: fine` media query |
| `client/src/pages/GSD.tsx:1162` | Add `setSelectedProject(null)` in `onInfo` handler |

## Verification

- `npx vite build` passes with no errors
- Desktop: terminal still auto-focuses (keyboard input works immediately)
- Mobile: terminal loads without keyboard, tap to focus works, info button closes terminal and shows drawer
