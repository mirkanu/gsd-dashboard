---
phase: quick-21
plan: 1
subsystem: client-ui
tags: [layout, desktop, responsive, 3-column]
dependency_graph:
  requires: [chatscope-integration, chat-window, gsd-drawer]
  provides: [desktop-3-column-layout, project-details-panel]
  affects: [GSD.tsx, ChatWindow.tsx, ChatListView.tsx]
tech_stack:
  added: []
  patterns: [useMediaQuery-hook, responsive-dual-layout, inline-terminal]
key_files:
  created:
    - client/src/components/ProjectDetailsPanel.tsx
  modified:
    - client/src/pages/GSD.tsx
    - client/src/components/ChatWindow.tsx
    - client/src/components/ChatListView.tsx
decisions:
  - useMediaQuery hook inline (5 lines) instead of external library
  - Terminal renders inline in grid cell on desktop via `inline` prop on TerminalOverlay
  - GsdDrawer only used on mobile; ProjectDetailsPanel for desktop right column
  - ChatWindow receives fillParent prop to use h-full in grid context
metrics:
  duration: 13min
  completed: "2026-04-04T13:53:00Z"
---

# Quick Task 21: 3-Column Desktop Layout Summary

Telegram Desktop-style 3-column layout for wide screens (>=1024px) with chat list, chat window, and project details visible simultaneously.

## One-liner

3-column desktop layout with persistent chat list, inline chat window, and project details panel using CSS grid and responsive media query.

## What Was Built

### Task 1: ProjectDetailsPanel Component (9b69efe)
Created `ProjectDetailsPanel.tsx` as an inline version of GsdDrawer tab content:
- Same tab strip and content-fetching logic (Tasks, Messages, State, Roadmap, Reqs, Plan)
- No overlay, no backdrop, no close button -- fills its grid cell
- Header shows project display name with session state badge
- Expand (Maximize2) button for markdown content tabs
- Duplicated MessageLog component (not exported from GsdDrawer)

### Task 2: 3-Column Layout Wiring (03e41a8)
Restructured GSD.tsx with dual render paths:

**Desktop (>=1024px):**
- `grid grid-cols-[20%_1fr_30%]` layout
- Left column: ChatListFilters + ChatListView (always visible)
- Middle column: ChatWindow or TerminalOverlay (inline) or empty state
- Right column: ProjectDetailsPanel or placeholder
- Header and rate-limit banner above the grid
- Body scroll lock disabled for desktop terminal

**Mobile (<1024px):**
- Completely unchanged single-column view switching
- GsdDrawer overlay still used for project details
- Terminal still opens as fixed overlay or new tab

**Component changes:**
- ChatWindow: `hideBackButton`, `hideDetailsButton`, `fillParent` props
- ChatListView: `activeProject` prop with `bg-accent/10` highlight
- TerminalOverlay: `inline` prop for relative positioning in grid

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 9b69efe | ProjectDetailsPanel inline right panel component |
| 2 | 03e41a8 | 3-column desktop layout with responsive breakpoint |

## Verification

- Vite production build succeeds
- TypeScript compilation: no new errors (pre-existing errors unchanged)
- Desktop: 3-column grid with 20%/50%/30% split
- Desktop: selecting project fills middle + right columns
- Desktop: terminal renders inline in middle column
- Mobile: identical to previous behavior
