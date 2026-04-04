# Quick Task 22: Fix terminal/chat interaction bugs

**Date:** 2026-04-04
**Status:** Complete

## Changes
1. **Terminal closes on project switch** — clicking a different project in chat list clears terminalProject
2. **Terminal scroll isolation** — wheel events on terminal container stop propagation, preventing page scroll
3. **Chat opens at bottom** — initialScrollDone ref resets on projectName change so each chat scrolls to newest
