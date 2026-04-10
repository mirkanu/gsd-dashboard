# Quick Task 39: Reduce mobile terminal scroll sensitivity

## Change

`SCROLL_DAMPING` in `client/src/pages/GSD.tsx` (line 479) doubled from **3 → 6** pixels of drag per tmux scroll line. Higher damping = slower/more deliberate scrolling, less jumpy.

## Commit

- `feat(quick-39): double mobile terminal scroll damping`
