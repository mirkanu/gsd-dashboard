---
phase: quick-21
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/pages/GSD.tsx
  - client/src/components/ProjectDetailsPanel.tsx
  - client/src/components/ChatWindow.tsx
  - client/src/components/ChatListView.tsx
autonomous: true
requirements: [LAYOUT-01]

must_haves:
  truths:
    - "Desktop (>=1024px) shows 3 columns simultaneously: chat list (20%), chat window (50%), project details (30%)"
    - "Selecting a project from list loads chat in middle and details in right panel"
    - "Empty state shows 3 columns with 'Select a project' placeholder in middle and empty right panel"
    - "Mobile (<1024px) behavior is completely unchanged — single-column view switching"
    - "Terminal on desktop replaces the chat column temporarily, returns to chat on close"
    - "Right panel shows GsdDrawer tab content (Tasks, Messages, State, Roadmap, Reqs, Plan) rendered inline"
  artifacts:
    - path: "client/src/components/ProjectDetailsPanel.tsx"
      provides: "Inline right panel with GsdDrawer tab content"
      min_lines: 40
    - path: "client/src/pages/GSD.tsx"
      provides: "3-column desktop layout orchestration"
  key_links:
    - from: "client/src/pages/GSD.tsx"
      to: "client/src/components/ProjectDetailsPanel.tsx"
      via: "renders in right column when project selected"
      pattern: "ProjectDetailsPanel"
    - from: "client/src/pages/GSD.tsx"
      to: "client/src/components/ChatWindow.tsx"
      via: "renders in middle column on desktop"
      pattern: "ChatWindow"
---

<objective>
Add a 3-column Telegram Desktop-style layout for wide screens (>=1024px). Left column (20%) shows chat list with filters, middle column (50%) shows the chat window, right column (30%) shows project details. Mobile remains unchanged as single-column view switching.

Purpose: Desktop users can see chat list, active chat, and project details simultaneously without toggling views.
Output: Responsive 3-column layout on desktop, unchanged mobile UX.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@client/src/pages/GSD.tsx (Main page — view switching, state, terminal overlay)
@client/src/components/ChatWindow.tsx (Chat window — header, messages, send box)
@client/src/components/ChatListView.tsx (Chat list with chatscope ConversationList)
@client/src/components/ChatListFilters.tsx (Filter tabs)
@client/src/components/GsdDrawer.tsx (Drawer overlay — extract tab content logic)

<interfaces>
From client/src/components/GsdDrawer.tsx:
```typescript
type TabId = "tasks" | "messages" | "state" | "roadmap" | "requirements" | "plan";
const TABS: { id: TabId; label: string }[];
// GsdDrawer fetches file content via api.gsd.file(project.name, activeTab)
// Tasks tab uses <TasksTab projectKey={project.name} />
// Messages tab uses internal <MessageLog projectName={project.name} />
```

From client/src/components/ChatWindow.tsx:
```typescript
interface ChatWindowProps {
  projectName: string;
  displayName: string;
  sessionState: SessionState | null;
  sessionUpdatedAt: string | null;
  contextTokens: number | null;
  tmuxActive: boolean;
  onBack: () => void;
  onOpenTerminal: () => void;
  onOpenDetails: () => void;
}
```

From client/src/lib/types.ts:
```typescript
interface GsdProject { name: string; display_name: string; sessionState: SessionState; ... }
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create ProjectDetailsPanel — inline version of GsdDrawer content</name>
  <files>client/src/components/ProjectDetailsPanel.tsx</files>
  <action>
Create a new component that renders the same tab content as GsdDrawer but inline (no overlay, no backdrop, no close button). This is the right-panel component for the 3-column layout.

Props: `{ project: GsdProject; onExpand?: (content: string, tabId: string) => void }`

Implementation:
- Copy the tab strip and content-fetching logic from GsdDrawer (tabs array, activeTab state, useEffect for api.gsd.file, content/loading/fetchError state).
- Render tabs at top, content below — no overlay div, no backdrop, no close button, no fixed positioning.
- Reuse TasksTab and the MessageLog pattern from GsdDrawer for "tasks" and "messages" tabs.
- Extract the MessageLog component from GsdDrawer into this file (or import if already exported — it is NOT exported, so duplicate or extract).
- Keep the Expand (Maximize2) button for markdown content tabs.
- Style: `flex flex-col h-full bg-surface-2 border-l border-border` — it fills its grid cell.
- Header: show project display_name (capitalized) with session state badge.
- Tab strip styling: same as GsdDrawer (px-3 py-2 text-xs).

Do NOT modify GsdDrawer — it still works as the mobile overlay.
  </action>
  <verify>npm run build 2>&1 | tail -5</verify>
  <done>ProjectDetailsPanel.tsx exists, renders tab content inline without overlay, TypeScript compiles.</done>
</task>

<task type="auto">
  <name>Task 2: Wire 3-column layout in GSD.tsx with responsive breakpoint</name>
  <files>client/src/pages/GSD.tsx, client/src/components/ChatWindow.tsx, client/src/components/ChatListView.tsx</files>
  <action>
Modify GSD.tsx to detect desktop width and render a 3-column grid layout. Use `lg:` breakpoint (1024px) via a `useMediaQuery` hook (inline, ~5 lines: `useState` + `useEffect` with `matchMedia('(min-width: 1024px)')`).

**Desktop layout (>=1024px):**

Replace the current conditional `chatView.view === 'list'` / `chatView.view === 'chat'` rendering with a persistent 3-column CSS grid:

```
<div className="grid grid-cols-[20%_1fr_30%] h-[calc(100dvh-2rem)]">
  {/* Left: chat list + filters — always visible */}
  <div className="flex flex-col border-r border-border overflow-hidden">
    <ChatListFilters ... />
    <div className="flex-1 overflow-y-auto">
      <ChatListView ... onSelectProject={...} />
    </div>
  </div>

  {/* Middle: chat window OR terminal OR empty state */}
  <div className="flex flex-col overflow-hidden">
    {chatView.project ? (
      terminalProject ? <TerminalOverlay .../> : <ChatWindow .../>
    ) : (
      <div className="flex items-center justify-center h-full text-gray-500">
        Select a project to start chatting
      </div>
    )}
  </div>

  {/* Right: project details panel */}
  <div className="overflow-hidden">
    {selectedProj ? (
      <ProjectDetailsPanel project={selectedProj} onExpand={...} />
    ) : (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm border-l border-border">
        Project details
      </div>
    )}
  </div>
</div>
```

Key behavior changes for desktop:
1. When a project is selected from chat list, set `chatView` to `{ view: 'chat', project: name }` AND auto-set `selectedProject` to the project object (so right panel shows details).
2. ChatWindow `onBack` on desktop: clear `chatView.project` (goes to empty state, keeps 3 columns).
3. ChatWindow `onOpenDetails` on desktop: no-op (details always visible). Can hide the FolderOpen button on desktop.
4. Terminal on desktop: render TerminalOverlay in middle column (NOT as fixed overlay). Modify: when `isDesktop && terminalProject`, render terminal inline in middle column instead of fixed overlay. Keep fixed overlay behavior for mobile.
5. GsdDrawer overlay: on desktop, do NOT render GsdDrawer (right panel replaces it). On mobile, keep GsdDrawer overlay as-is.
6. The header (title, theme toggle, refresh) moves above the grid on desktop.

**ChatWindow.tsx changes:**
- Accept optional `hideBackButton` prop (boolean, default false). When true, hide the ArrowLeft back button. Desktop passes `hideBackButton={true}`.
- Accept optional `hideDetailsButton` prop (boolean, default false). When true, hide the FolderOpen button. Desktop passes `hideDetailsButton={true}`.

**ChatListView.tsx changes:**
- Accept optional `activeProject` prop (string | undefined). Highlight the currently selected conversation row with a subtle `bg-accent/10` background so user knows which chat is active.

**Mobile layout (<1024px):**
Completely unchanged — same single-column `chatView` switching as today.

**Important details:**
- Keep all existing state management (projects, autopilotRuns, rateLimit, etc.) unchanged.
- Remove the `space-y-6` wrapper on desktop (grid replaces it).
- The chat list column should NOT show ProjectCard components — it stays as the chatscope ConversationList.
- Selected project for right panel: derive from `chatView.project` — find the project in `projects` array.
  </action>
  <verify>npm run build 2>&1 | tail -5</verify>
  <done>Desktop shows 3-column grid with chat list, chat window, and project details. Mobile unchanged. Terminal on desktop renders in middle column. Build succeeds with no errors.</done>
</task>

</tasks>

<verification>
- `npm run build` succeeds with no TypeScript errors
- Desktop (>=1024px): 3 columns visible simultaneously, selecting project fills middle + right
- Desktop empty state: 3 columns with placeholder text in middle and right
- Desktop terminal: replaces chat in middle column, chat returns on close
- Mobile (<1024px): identical to current behavior (list -> chat -> back)
</verification>

<success_criteria>
- 3-column layout renders on screens >= 1024px with 20%/50%/30% split
- Chat list with filters always visible on left
- Selecting a project shows chat in middle and details in right simultaneously
- Terminal replaces chat column on desktop (not fixed overlay)
- Mobile behavior is completely unchanged
- GsdDrawer overlay only used on mobile
- Build passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/21-3-column-desktop-layout-chat-list-chat-w/21-SUMMARY.md`
</output>
