---
phase: quick-27
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/pages/GSD.tsx
  - client/src/components/ProjectDetailsPanel.tsx
autonomous: true
requirements: [Q27]

must_haves:
  truths:
    - "Selecting a project on desktop immediately shows the terminal as the center panel"
    - "Desktop layout is: project list (left) | terminal (center) | project details (right)"
    - "Mobile: selecting a project opens the terminal view (not a chat window)"
    - "Mobile: send bar and special key bar remain visible below the terminal"
    - "Mobile: info button in terminal header opens the GsdDrawer"
    - "ChatWindow and ChatMessageRenderer are deleted from the codebase"
    - "ProjectDetailsPanel Messages tab is removed"
    - "No TypeScript compile errors"
  artifacts:
    - path: "client/src/pages/GSD.tsx"
      provides: "Refactored layout — terminal-first, no ChatWindow"
    - path: "client/src/components/ProjectDetailsPanel.tsx"
      provides: "Details panel without Messages tab"
  key_links:
    - from: "GSD.tsx project list (onSelectProject)"
      to: "TerminalOverlay inline={true}"
      via: "selectedProject state directly triggers terminal mount"
    - from: "Mobile terminal header"
      to: "GsdDrawer"
      via: "info icon button sets selectedProject state"
---

<objective>
Remove ChatWindow entirely and make the terminal the default center panel. Desktop auto-connects on project select. Mobile shows terminal and info button opens GsdDrawer.

Purpose: The terminal is already the primary way to interact with GSD sessions — chat was an awkward layer on top. Making terminal primary removes friction and eliminates the dead chat UX.
Output: GSD.tsx with terminal-first layout, ChatWindow.tsx + ChatMessageRenderer.tsx deleted, ProjectDetailsPanel without Messages tab.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@client/src/pages/GSD.tsx
@client/src/components/ProjectDetailsPanel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor GSD.tsx — terminal-first layout, remove ChatWindow</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
Refactor GSD.tsx to make the terminal the primary center panel.

**State changes:**
- Replace `chatView: { view: 'list' | 'chat'; project?: string }` with `selectedProject: string | null` (simpler — no view mode needed)
- Remove `unreadCounts` state and the eventBus subscriber that tracks `gsd_chat_message` (chat messages no longer tracked client-side)
- Remove `terminalProject` / `terminalInitialValue` state — the terminal IS always shown for the selected project, so there is no separate "open terminal" state. The terminal connects when `selectedProject` is non-null.
- Keep `terminalWsBase` state (still needed for WebSocket URL)
- Remove `selectedProject` (old separate state at line 781) — consolidate into the single new `selectedProject: string | null`
- The `selectedProj` derived value should come from `selectedProject` directly: `projects.find(p => p.name === selectedProject) ?? null`

**Imports to remove:**
- `import { ChatWindow } from "../components/ChatWindow"` — file will be deleted
- `import type { ..., GsdChatMessageEvent } from "../lib/types"` — remove `GsdChatMessageEvent` from the type import (keep other types)

**Desktop layout (lines ~1026–1138):**
- Grid stays `grid-cols-[20%_1fr_30%]`
- Left column: `ChatListFilters` + `ChatListView` unchanged, but `onSelectProject` now sets `selectedProject` (not `chatView`)
  - Remove `unreadCounts` prop from `ChatListView` call (or keep passing empty object if prop still exists — see Task 2)
  - Remove `activeProject={chatView.project}` — pass `activeProject={selectedProject}`
- Center column: when `selectedProject` is non-null, always render `TerminalOverlay` with `inline={true}`. When null, show "Select a project to view its terminal" empty state.
  - No more ChatWindow, no more toggling between chat and terminal
  - `onClose` for the inline terminal: reset `selectedProject` to null (or no-op — no close button needed on inline desktop terminal)
  - The inline terminal header already has a close/back affordance via `onClose` — wire it to `() => setSelectedProject(null)`
- Right column: `ProjectDetailsPanel` uses `selectedProj` as before. No changes.

**Mobile layout (lines ~1141–1231):**
- Remove the ChatWindow render block entirely (lines ~1182–1199)
- When `selectedProject` is non-null, show the `TerminalOverlay` (non-inline, full overlay) for `selectedProject`
  - The terminal's `onClose` resets `selectedProject` to null
  - Add an info icon button to the terminal header: use the `TerminalOverlay`'s existing header area. The cleanest approach: pass an `onInfo` prop to `TerminalOverlay`, which renders an `<Info>` icon button (lucide-react) in the header row alongside the existing close/select-mode buttons. On click, set `selectedProject` (old separate GsdDrawer state) to the current project object.
  - Keep `GsdDrawer` usage for mobile info (already exists — just keep wiring `selectedProject` object to it)
- When `selectedProject` is null, show project list (ChatListFilters + ChatListView) as before
- Remove the outer `chatView.view === 'list'` / `chatView.view === 'chat'` conditional — just check `selectedProject !== null`

**handleOpenTerminal:** Remove this function entirely — no longer needed. Terminal opens automatically on project select.

**handleTerminalClose:** Simplify to `() => { setSelectedProject(null); load(false); }`

**TAB_TITLES:** Remove the `"messages"` entry.

**TerminalOverlay component (defined inside GSD.tsx, ~lines 263–590):**
- Add optional `onInfo?: () => void` prop to `TerminalOverlayProps`
- In the terminal header bar (the row with close button, select-mode, paste), add an `<Info>` icon button (from lucide-react) that calls `onInfo?.()` — only render when `onInfo` is provided
- On mobile, this button will be provided; on desktop inline mode, it won't be (info panel is always visible on right)

**SendBox:** Keep as-is. It's used inside TerminalOverlay.

**Body scroll lock effect:** Update condition — was `terminalProject && !isDesktop`, change to `selectedProject && !isDesktop` (since selectedProject IS the terminal project now).

**Do NOT remove:** `ChatListView`, `ChatListFilters`, `GsdDrawer`, `ProjectDetailsPanel`, autopilot state/effects, polling, load(), pauseSession, archiveProject, unarchiveProject, fullScreen/MarkdownViewer.
  </action>
  <verify>
    <automated>npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>
    Desktop: selecting a project renders TerminalOverlay inline in center column. Right panel shows ProjectDetailsPanel. No ChatWindow rendered anywhere.
    Mobile: selecting a project shows TerminalOverlay with send bar. Info button opens GsdDrawer.
    No TypeScript errors in GSD.tsx.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove Messages tab from ProjectDetailsPanel, delete ChatWindow + ChatMessageRenderer</name>
  <files>
    client/src/components/ProjectDetailsPanel.tsx
    client/src/components/ChatWindow.tsx
    client/src/components/ChatMessageRenderer.tsx
  </files>
  <action>
**ProjectDetailsPanel.tsx:**
- Remove `"messages"` from `TABS` array (line 15)
- Remove `TabId` union member `"messages"` (line 11: change to `"tasks" | "state" | "roadmap" | "requirements" | "plan"`)
- Remove `MessageLog` function component (lines ~29–80) — the internal component that calls `api.gsd.messages()`
- Remove the `activeTab === "messages"` branch from the render (around line 165): `{activeTab === "messages" ? (<MessageLog .../>)` — delete this branch
- Remove `GsdMessage` from the import of `../lib/types` (line 6) if it's only used by MessageLog
- Keep all other tabs (tasks, state, roadmap, requirements, plan) intact

**ChatListView.tsx — check `unreadCounts` prop:**
- Run: `grep -n "unreadCounts" client/src/components/ChatListView.tsx`
- If `unreadCounts` is a required prop, make it optional with default `{}` so GSD.tsx can stop passing it

**Delete files:**
- `client/src/components/ChatWindow.tsx`
- `client/src/components/ChatMessageRenderer.tsx`
- `client/src/components/ChatTest.tsx` (if it exists and only tests ChatWindow)

Run `npm run build` to confirm no dangling imports cause compile errors. Fix any remaining import errors in GSD.tsx (e.g., if `GsdChatMessageEvent` type is still imported but unused after Task 1).
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run build 2>&1 | tail -30</automated>
  </verify>
  <done>
    Build passes with no errors. ChatWindow.tsx and ChatMessageRenderer.tsx do not exist. ProjectDetailsPanel has no Messages tab. `npm run test:client` passes.
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. `npm run build` exits 0
2. `npm run test:client` passes
3. `grep -r "ChatWindow\|ChatMessageRenderer" client/src/` returns nothing (files deleted, no remaining imports)
4. `grep -n "messages" client/src/components/ProjectDetailsPanel.tsx` shows no tab entry
</verification>

<success_criteria>
- Terminal is the default center view on both desktop and mobile after project selection
- ChatWindow.tsx and ChatMessageRenderer.tsx deleted
- Messages tab removed from ProjectDetailsPanel
- Build passes, no TypeScript errors
- Mobile info button in terminal header opens GsdDrawer
</success_criteria>

<output>
After completion, create `.planning/quick/27-remove-chat-window-make-terminal-the-pri/27-SUMMARY.md`
</output>
