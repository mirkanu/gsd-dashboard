# Phase 32: Project Detail Panel - Research

**Researched:** 2026-04-04
**Domain:** React UI components, panel layout, project controls
**Confidence:** HIGH

## Summary

Phase 32 fills gaps in the project detail panel that quick-21 scaffolded. The `ProjectDetailsPanel.tsx` component already exists with tabs (Tasks, Messages, State, Roadmap, Reqs, Plan) and markdown rendering. What is MISSING: autopilot controls (start/pause/resume), project pause/archive/unarchive buttons, raw terminal access button, progress bars/status indicators, and project metadata display. Additionally, on mobile the `GsdDrawer` overlay is similarly incomplete. Finally, CHAT-09 requires that sending a message to a paused/archived project triggers a "Reopen session?" confirmation dialog.

The existing code in `GSD.tsx` has all these controls already built -- they live in the `ProjectCard` component and the `AutopilotControls` sub-component. The work is primarily about **extracting and composing** these controls into the detail panel, not building new functionality. The confirmation dialog for paused/archived sends is new behavior that needs to be added to `ChatWindow`.

**Primary recommendation:** Extract autopilot controls and project action buttons from ProjectCard into reusable components, compose them into ProjectDetailsPanel and GsdDrawer, add progress/metadata section, and add reopen confirmation to ChatWindow's send handler.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DET-01 | Tapping chat header/title opens project detail panel (slide-in or overlay) | Already works: desktop auto-shows right panel; mobile `onOpenDetails` opens GsdDrawer. Verify and polish. |
| DET-02 | Contains all existing controls: autopilot, pause, archive, reopen, raw terminal | AutopilotControls and action buttons exist in ProjectCard. Extract into shared components and add to both ProjectDetailsPanel and GsdDrawer. |
| DET-03 | File tabs (State, Roadmap, Requirements, Plan) with markdown rendering | Already implemented in both ProjectDetailsPanel and GsdDrawer. Verified working. |
| DET-04 | Progress bars and status indicators (phase completion, session state, context tokens) | GsdProject type has `state.progress`, `sessionState`, `contextTokens`. ContextBar component exists in GSD.tsx. Need to add these to panel header/metadata section. |
| DET-05 | Project metadata (display name, session state, context tokens) | Data available on GsdProject. Need metadata section in panel showing display name, session state badge, context window usage, milestone, current phase. |
| CHAT-09 | Paused/archived projects show full chat history; sending triggers "Reopen session?" confirmation | Chat history already shows for all states. Need confirmation dialog in ChatWindow.handleSend when sessionState is "paused" or "archived". |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | UI framework | Already in use |
| Tailwind CSS | 3.x | Styling | Project standard |
| lucide-react | latest | Icons | Project standard |
| react-markdown + remark-gfm | latest | Markdown rendering | Already used in panel |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All required libs already installed |

**Installation:** No new packages needed.

## Architecture Patterns

### Current Component Structure
```
GSD.tsx
  ProjectCard (has AutopilotControls, pause/archive buttons, terminal button)
  ChatWindow (message display + send, header with terminal/details buttons)
  ProjectDetailsPanel (desktop right column: tabs + markdown content)
  GsdDrawer (mobile overlay: same tab content as ProjectDetailsPanel)
```

### Target Component Structure
```
GSD.tsx
  ChatWindow (add reopen confirmation for paused/archived)
  ProjectDetailsPanel (add controls section + metadata section)
  GsdDrawer (add controls section + metadata section)
  [Shared]
    ProjectControls (extracted: autopilot + pause/archive/unarchive + terminal)
    ProjectMetadata (new: progress bars, context gauge, milestone info)
```

### Pattern 1: Extract Controls into Shared Component
**What:** Move AutopilotControls and action buttons from ProjectCard into a `ProjectControls` component that both ProjectDetailsPanel and GsdDrawer can render.
**When to use:** When the same interactive controls need to appear in multiple containers.
**Key concern:** AutopilotControls needs `autopilotRun` state. Currently fetched in GSD.tsx and passed to ProjectCard. The detail panel also needs this data -- pass it as a prop from GSD.tsx.

### Pattern 2: Confirmation Dialog for Paused/Archived Send
**What:** In ChatWindow, before sending a message when sessionState is "paused" or "archived", show a confirmation prompt asking "Reopen session?" with Confirm/Cancel.
**When to use:** CHAT-09 requirement.
**Implementation:** Use `window.confirm()` for simplicity (matches existing patterns in AutopilotControls), or a small inline confirmation banner above the send box for better UX. The inline banner approach is preferred since it doesn't block the thread.

### Anti-Patterns to Avoid
- **Duplicating AutopilotControls logic:** Don't copy-paste the autopilot state management. Extract once, use everywhere.
- **Prop drilling autopilotRuns deeply:** Keep autopilotRuns in GSD.tsx, pass the single relevant run to ProjectDetailsPanel/GsdDrawer.
- **Breaking mobile GsdDrawer behavior:** Mobile must continue using the overlay drawer. Don't accidentally remove it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirmation dialog | Custom modal component | `window.confirm()` or inline confirmation banner | Matches existing codebase patterns (see AutopilotControls handleStart/handlePlanAll) |
| Progress bar | Custom progress component | Inline Tailwind div with percentage width | ContextBar pattern already exists in GSD.tsx |
| Markdown rendering | Custom parser | react-markdown + remark-gfm | Already in use throughout |

## Common Pitfalls

### Pitfall 1: Stale autopilotRun in Detail Panel
**What goes wrong:** Detail panel shows stale autopilot status because it doesn't receive WebSocket updates.
**Why it happens:** AutopilotRuns state lives in GSD.tsx and updates via eventBus subscription. If you pass a snapshot instead of the live value, it goes stale.
**How to avoid:** Pass `autopilotRuns.get(project.name)` as a prop that re-renders when the Map updates. GSD.tsx already subscribes to autopilot_progress events.
**Warning signs:** Autopilot buttons show "Run Autopilot" when it's actually running.

### Pitfall 2: GsdDrawer and ProjectDetailsPanel Diverging
**What goes wrong:** Controls work in desktop panel but not in mobile drawer (or vice versa).
**Why it happens:** Two separate components with duplicated logic.
**How to avoid:** Extract shared controls into a single component. Both panel and drawer render it.

### Pitfall 3: Reopen Confirmation Sending Without Actual Reopen
**What goes wrong:** User confirms "reopen" but the message just sends to an inactive tmux session.
**Why it happens:** There's no automatic reopen-tmux + send flow.
**How to avoid:** The confirmation should either (a) call `api.gsd.reopenTmux()` first, then send, or (b) just warn the user that the session is paused and they need to reopen it manually. Option (b) is simpler and safer. The confirmation text should say something like "This project is paused. Send anyway?" -- which sends to tmux if it's still alive, or shows an error if not.

### Pitfall 4: Missing load() Callback After Archive/Unarchive
**What goes wrong:** User archives a project from the detail panel, but the chat list doesn't update.
**Why it happens:** The archive/unarchive API calls in the panel don't trigger a project list refresh.
**How to avoid:** Pass the `load()` refresh callback (or specific action handlers like `onArchive`) from GSD.tsx down to the detail panel, matching how ProjectCard already does it.

## Code Examples

### Existing AutopilotControls (extract from GSD.tsx lines 626-817)
The `AutopilotControls` component is already self-contained. It takes `project` and `autopilotRun` props. Can be moved to its own file with zero changes.

### Existing Action Buttons Pattern (from ProjectCard)
```typescript
// Pause / Archive / Unarchive buttons pattern from ProjectCard
{project.sessionState !== "archived" ? (
  <div className="flex gap-3">
    {project.sessionState !== "paused" && (
      <button onClick={onPauseSession} className="text-[10px] text-red-600 hover:text-red-400">Pause</button>
    )}
    <button onClick={onArchive} className="text-[10px] text-gray-600 hover:text-gray-400">Archive</button>
  </div>
) : (
  <button onClick={onUnarchive} className="text-[10px] text-gray-500 hover:text-gray-300">Unarchive</button>
)}
```

### Reopen Confirmation Pattern
```typescript
// In ChatWindow.handleSend, before sending:
const isPausedOrArchived = sessionState === "paused" || sessionState === "archived";
if (isPausedOrArchived && !confirmedReopen) {
  setShowReopenConfirm(true);
  setPendingMessage(trimmed);
  return;
}
// Then in JSX, show inline confirmation banner
```

### Progress/Metadata Section Pattern
```typescript
// Phase progress bar using existing GsdState.progress
const progress = project.state?.progress;
{progress && progress.percent != null && (
  <div>
    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
      <span>Phase progress</span>
      <span>{progress.percent}%</span>
    </div>
    <div className="w-full h-1.5 rounded-full bg-surface-3 overflow-hidden">
      <div className="h-full rounded-full bg-accent" style={{ width: `${progress.percent}%` }} />
    </div>
  </div>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GsdDrawer has all controls | Quick-21 split into desktop ProjectDetailsPanel + mobile GsdDrawer | 2026-04-04 | Both need controls, currently neither has them |
| ProjectCard has controls inline | Controls need to live in detail panel instead | This phase | Extract and relocate |

## Open Questions

1. **Should archive/pause from detail panel close the chat?**
   - What we know: Archiving removes from default filter view. Pausing changes state badge.
   - What's unclear: Should the UI navigate away from the archived/paused chat?
   - Recommendation: Keep the chat open but update the state badge. User can navigate away manually. This matches chat app behavior (you can still view archived chats).

2. **Should the terminal button in detail panel open inline (desktop) or new tab (mobile)?**
   - What we know: Current ChatWindow header terminal button already handles this correctly via `onOpenTerminal` prop.
   - Recommendation: Reuse the same handler. On desktop, terminal opens inline in the middle column. On mobile, opens in new tab.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest + jsdom |
| Config file | client/vitest.config.ts |
| Quick run command | `cd client && npx vitest run --reporter=verbose` |
| Full suite command | `npm run test:client` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DET-01 | Header tap opens detail panel | manual-only | Visual verification on desktop + mobile | N/A |
| DET-02 | Controls in detail panel | unit | `cd client && npx vitest run src/components/__tests__/ProjectDetailsPanel.test.tsx` | No - Wave 0 |
| DET-03 | File tabs render markdown | manual-only | Already working, visual verification | N/A |
| DET-04 | Progress bars visible | unit | `cd client && npx vitest run src/components/__tests__/ProjectDetailsPanel.test.tsx` | No - Wave 0 |
| DET-05 | Metadata displayed | unit | `cd client && npx vitest run src/components/__tests__/ProjectDetailsPanel.test.tsx` | No - Wave 0 |
| CHAT-09 | Reopen confirmation on paused send | unit | `cd client && npx vitest run src/components/__tests__/ChatWindow.test.tsx` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd client && npx vitest run --reporter=verbose`
- **Per wave merge:** `npm run test:client`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `client/src/components/__tests__/ProjectDetailsPanel.test.tsx` -- covers DET-02, DET-04, DET-05 (renders controls, progress, metadata)
- [ ] `client/src/components/__tests__/ChatWindow.test.tsx` -- covers CHAT-09 (reopen confirmation)
- [ ] Extract `AutopilotControls` to own file before testing in isolation

## Sources

### Primary (HIGH confidence)
- Direct code reading: `client/src/components/ProjectDetailsPanel.tsx`, `GsdDrawer.tsx`, `ChatWindow.tsx`, `GSD.tsx`
- Direct code reading: `client/src/lib/types.ts`, `client/src/lib/api.ts`

### Secondary (MEDIUM confidence)
- Quick-21 summary: `.planning/quick/21-3-column-desktop-layout-chat-list-chat-w/21-SUMMARY.md`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, all code inspected directly
- Architecture: HIGH - extraction patterns are straightforward, all source components exist
- Pitfalls: HIGH - identified from direct code analysis of existing patterns and data flow

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable codebase, no external dependency changes)
