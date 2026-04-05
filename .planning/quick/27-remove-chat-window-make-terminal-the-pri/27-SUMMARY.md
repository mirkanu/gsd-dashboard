---
phase: quick-27
plan: 01
subsystem: client-ui
tags: [terminal, refactor, cleanup, mobile, desktop]
key-files:
  modified:
    - client/src/pages/GSD.tsx
    - client/src/components/ProjectDetailsPanel.tsx
  deleted:
    - client/src/components/ChatWindow.tsx
    - client/src/components/ChatMessageRenderer.tsx
    - client/src/components/ChatTest.tsx
decisions:
  - selectedProject consolidated into single string|null state replacing chatView + terminalProject + selectedProject
  - Terminal auto-connects on project select with no extra click on desktop or mobile
  - Mobile info button (Info icon) in terminal header opens GsdDrawer for project details
  - drawerProject state added for mobile GsdDrawer (separate from selectedProject string)
  - onOpenTerminal in ProjectDetailsPanel and GsdDrawer left as no-op (terminal is always shown)
metrics:
  completed: 2026-04-05
  tasks: 2
  files_changed: 5
  files_deleted: 3
---

# Quick Task 27: Remove Chat Window, Make Terminal the Primary View - Summary

**One-liner:** Terminal-first layout replacing ChatWindow with inline TerminalOverlay on desktop, auto-connecting on project select, with mobile info button opening GsdDrawer.

## Tasks Completed

### Task 1: Refactor GSD.tsx — terminal-first layout, remove ChatWindow

Refactored GSD.tsx state management and layout:

- Replaced `chatView: { view: 'list' | 'chat'; project?: string }` + `selectedProject: GsdProject | null` + `terminalProject` + `terminalInitialValue` + `unreadCounts` with a single `selectedProject: string | null`
- `selectedProj` now derived directly: `projects.find(p => p.name === selectedProject)`
- Removed `GsdChatMessageEvent` type import and the chat message unread-count subscriber
- Removed `ChatWindow` import
- Added `onInfo?: () => void` prop to `TerminalOverlayProps`; renders `<Info>` icon button in header when provided
- Desktop center column: always renders `TerminalOverlay inline={true}` when `selectedProject` is set, empty state otherwise
- Mobile: `TerminalOverlay` shown full-screen with `onInfo` wired to `setDrawerProject` for GsdDrawer
- Removed `handleOpenTerminal` function entirely
- Simplified `handleTerminalClose` to reset `selectedProject` to null
- Body scroll lock effect updated to key on `selectedProject` instead of `terminalProject`
- Removed "messages" from `TAB_TITLES`

**Commit:** 54735fe

### Task 2: Remove Messages tab from ProjectDetailsPanel, delete ChatWindow + ChatMessageRenderer

- Removed `"messages"` from `TabId` union and `TABS` array in ProjectDetailsPanel
- Removed `MessageLog` internal component
- Removed `GsdMessage` from type imports
- Removed `activeTab === "messages"` branch from content render
- Updated expand button condition to remove `activeTab !== "messages"` check
- Deleted: `ChatWindow.tsx`, `ChatMessageRenderer.tsx`, `ChatTest.tsx`

Build verified: `vite build` exits 0, no TypeScript errors, no dangling imports.

**Commit:** 5dbb951

## Deviations from Plan

### Auto-additions

**1. [Rule 2 - Missing state] Added `drawerProject` state for mobile GsdDrawer**
- Found during: Task 1
- Issue: Mobile GsdDrawer needs a `GsdProject` object but `selectedProject` is now a `string | null`. The old code reused `selectedProject: GsdProject | null` for both. After consolidation, a separate state is needed to pass the full project object to GsdDrawer.
- Fix: Added `drawerProject: GsdProject | null` state; `onInfo` callback in TerminalOverlay sets it from `projects.find()`. GsdDrawer close clears it.
- Files modified: client/src/pages/GSD.tsx

None — plan executed as written for the core changes.

## Self-Check

Files verified:
- client/src/pages/GSD.tsx — exists, modified
- client/src/components/ProjectDetailsPanel.tsx — exists, modified
- client/src/components/ChatWindow.tsx — deleted (confirmed absent)
- client/src/components/ChatMessageRenderer.tsx — deleted (confirmed absent)

Commits verified:
- 54735fe — Task 1 commit
- 5dbb951 — Task 2 commit

Build: vite build exits 0, no errors.
Tests: 115 passed, 2 pre-existing Sidebar test failures (unrelated to this task).

## Self-Check: PASSED
