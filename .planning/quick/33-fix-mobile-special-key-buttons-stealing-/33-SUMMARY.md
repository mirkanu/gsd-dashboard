# Quick Task 33: Fix mobile special key buttons stealing terminal focus — Summary

**One-liner:** Added `tabIndex={-1}` to special key buttons and delayed `specialKeyPressRef` reset to prevent iOS keyboard flicker.

## Root Cause

On iOS, tapping a special key button (arrows, Tab, Esc, etc.) triggers a blur event on the xterm textarea. The `specialKeyPressRef` flag was supposed to prevent this, but `onTouchEnd` cleared the flag before the blur handler ran — a race condition specific to iOS event ordering.

## What Was Done

1. **`tabIndex={-1}`** on all SpecialKeyBar buttons — prevents them from being focusable, so tapping them doesn't trigger a focus-stealing cycle
2. **150ms delay on `specialKeyPressRef` reset** — `onTouchEnd` now uses `setTimeout(() => { specialKeyPressRef.current = false }, 150)` so the blur handler always sees the flag as true and refocuses the terminal

## Verification

- `npx vite build` passes
- Logic: buttons can't receive focus (tabIndex=-1) + blur handler refocuses terminal when flag is set + flag stays true long enough for iOS blur to fire
