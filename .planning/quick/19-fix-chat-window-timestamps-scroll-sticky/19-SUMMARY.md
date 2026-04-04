# Quick Task 19: Fix chat window UX issues

**Date:** 2026-04-04
**Status:** Complete

## Changes
1. **Timestamps** — Each message bubble now shows HH:MM time below it
2. **Scroll fixed** — Replaced chatscope MessageList (broken mouse wheel) with plain `overflow-y-auto` div
3. **Sticky header** — Chat header stays at top with Terminal icon and Details icon always visible
4. **Terminal button** — Opens in new tab on mobile, overlay on desktop (same as chat list behavior)
5. **Details button** — Opens GsdDrawer with Tasks, Messages, Plan, Roadmap tabs

## Files changed
- `client/src/components/ChatWindow.tsx` — Header buttons, scroll container, new props
- `client/src/components/ChatMessageRenderer.tsx` — Timestamps, replaced chatscope Message with custom bubbles
- `client/src/pages/GSD.tsx` — Wire onOpenTerminal, onOpenDetails, tmuxActive props
