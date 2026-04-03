# Quick Task 17: Add Pause button on each card

**Date:** 2026-04-03
**Status:** Complete

## Change
Added a "Pause" button next to "Archive" on each non-paused, non-archived project card. Clicking it kills the tmux session, which moves the card to the "Paused" column.

## Implementation
- **Server** (`server/routes/gsd.js`): New `POST /api/gsd/projects/:name/pause-session` route that calls `tmux kill-session` on the project's tmux session. Includes GSD_DATA_URL proxy support.
- **Client API** (`client/src/lib/api.ts`): Added `api.gsd.pauseSession(name)` method.
- **Client UI** (`client/src/pages/GSD.tsx`): Added red "Pause" button next to "Archive" in the card footer. Only shown when session is not already paused/archived.
