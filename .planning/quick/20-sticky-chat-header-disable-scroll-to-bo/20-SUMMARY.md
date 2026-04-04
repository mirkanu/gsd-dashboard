# Quick Task 20: Sticky chat header + disable scroll animation

**Date:** 2026-04-04
**Status:** Complete

## Changes
1. **Sticky header** — ChatWindow uses `calc(100dvh - 2rem)` fixed height so the header stays at top and message area scrolls independently
2. **No scroll animation** — Initial load jumps to bottom instantly instead of smooth scroll. No auto-scroll on subsequent messages.

## Files changed
- `client/src/components/ChatWindow.tsx` — Fixed height container, instant scroll, disabled auto-scroll after load
