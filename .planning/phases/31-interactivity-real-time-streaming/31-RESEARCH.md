# Phase 31: Interactivity + Real-Time Streaming - Research

**Researched:** 2026-04-03
**Domain:** React client-side interactivity, WebSocket streaming, unread tracking
**Confidence:** HIGH

## Summary

Phase 31 addresses four requirements (ACT-01, ACT-02, ACT-03, INF-03) that bring interactivity and real-time updates to the chat-first dashboard. The good news: most infrastructure is already in place. The WebSocket broadcast pipeline (classifier -> broadcast -> eventBus -> ChatWindow) is fully wired. CommandChips and CheckpointPrompt components exist and render correctly. The main gaps are behavioral wiring issues and the completely new unread tracking feature.

**Key finding:** ACT-01 (command chips insert into reply box) is already working -- `handleChipSelect` in ChatWindow sets `inputText` and focuses the textarea. ACT-02 has a **critical bug**: CheckpointPrompt's `onAction` is wired to `handleSend` (which auto-sends), but the requirement says it should insert into the reply box without sending. INF-03 (WebSocket streaming) is already working -- ChatWindow subscribes to `gsd_chat_message` events. ACT-03 (unread badges) is entirely new and needs client-side state management.

**Primary recommendation:** This phase is mostly wiring fixes and one new feature (unread tracking). The only code change needed for ACT-02 is changing the `onAction` prop from `handleSend` to a new handler that inserts text into the textarea (like `handleChipSelect`). ACT-03 requires a new React state/context for per-project unread counts driven by eventBus subscriptions.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACT-01 | Tapping a suggested command/action inserts it into reply box (not auto-send) | Already working: `handleChipSelect` sets `inputText` + focuses textarea. CommandChips renders in ChatWindow when sessionState === 'waiting'. Verify still works correctly. |
| ACT-02 | Multi-choice answers from GSD rendered as tappable buttons that insert the choice | Bug: CheckpointPrompt buttons call `onAction` which is wired to `handleSend` (auto-sends). Must rewire to insert into textarea instead. |
| ACT-03 | Unread badge on chat rows when new messages arrive while not viewing that chat | New feature: needs per-project unread count state, eventBus subscription at app level, reset on chat open. ChatListView already passes `unreadCnt={0}` to chatscope Conversation component. |
| INF-03 | WebSocket streaming of classified messages for real-time chat updates | Already working: TmuxClassifier broadcasts `gsd_chat_message`, ChatWindow subscribes via eventBus and appends to messages state. Verify no edge cases. |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| React 18 + Vite | Client framework | Already in use |
| @chatscope/chat-ui-kit-react | Chat UI (Conversation with unreadCnt) | Already adopted, has unread dot styling |
| ws (server) | WebSocket broadcast | Already wired in server/websocket.js |
| eventBus (custom) | Client-side WS message distribution | Already in client/src/lib/eventBus.ts |

### No new dependencies needed
This phase requires zero new libraries. All functionality is achievable with existing code and React state management.

## Architecture Patterns

### Current Message Flow (already working)
```
TmuxClassifier.poll() 
  -> classifyChunks() 
  -> insertClassifiedMessage (SQLite) 
  -> broadcast('gsd_chat_message', { project, message }) 
  -> WebSocket to all clients 
  -> eventBus.publish() 
  -> ChatWindow subscribes, appends to messages state
```

### Pattern 1: Insert-into-textarea (for ACT-01 and ACT-02)
**What:** Both command chips and checkpoint buttons should insert text into the textarea without sending.
**Current state:**
- CommandChips: Already uses `handleChipSelect` which calls `setInputText(cmd)` + `textareaRef.current?.focus()` -- CORRECT.
- CheckpointPrompt: Uses `onAction={handleSend}` which auto-sends -- WRONG per requirement.

**Fix:** Create a unified `handleInsertText` callback that sets the textarea value. Pass this to ChatMessageRenderer instead of `handleSend`.

```typescript
// In ChatWindow.tsx - change the onAction prop
// FROM:
<ChatMessageRenderer msg={msg} onAction={handleSend} />
// TO:
<ChatMessageRenderer msg={msg} onAction={handleChipSelect} />
```

This reuses the existing `handleChipSelect` function which already does the right thing: `setInputText(cmd)` + focus.

### Pattern 2: Unread Count State (for ACT-03)
**What:** Track per-project unread message counts, increment when messages arrive for non-active chats, reset when chat is opened.
**Where to store:** In the GSD page component (already manages all project state).

```typescript
// In GSD.tsx
const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

// Subscribe to eventBus at the GSD page level
useEffect(() => {
  const unsub = eventBus.subscribe((msg) => {
    if (msg.type !== 'gsd_chat_message') return;
    const evt = msg.data as GsdChatMessageEvent;
    // Only increment if the user is NOT currently viewing this project's chat
    setUnreadCounts(prev => ({
      ...prev,
      [evt.project]: (prev[evt.project] || 0) + 1,
    }));
  });
  return unsub;
}, []);

// Reset count when opening a chat
const handleSelectProject = (name: string) => {
  setChatView({ view: 'chat', project: name });
  setUnreadCounts(prev => ({ ...prev, [name]: 0 }));
};
```

**Critical detail:** The unread count must NOT increment for the currently-viewed project. The subscription needs access to the current `chatView.project` value. Use a ref to avoid stale closure:

```typescript
const activeProjectRef = useRef<string | undefined>();
activeProjectRef.current = chatView.project;

useEffect(() => {
  const unsub = eventBus.subscribe((msg) => {
    if (msg.type !== 'gsd_chat_message') return;
    const evt = msg.data as GsdChatMessageEvent;
    if (evt.project === activeProjectRef.current) return; // skip active chat
    setUnreadCounts(prev => ({
      ...prev,
      [evt.project]: (prev[evt.project] || 0) + 1,
    }));
  });
  return unsub;
}, []);
```

### Pattern 3: Passing unread counts to ChatListView
**What:** ChatListView already renders `unreadCnt={0}`. Just pass real data.

```typescript
// ChatListView props: add unreadCounts
interface ChatListViewProps {
  projects: GsdProject[];
  onSelectProject: (name: string) => void;
  activeProject?: string;
  unreadCounts?: Record<string, number>;
}

// In Conversation rendering:
unreadCnt={unreadCounts?.[p.name] || 0}
```

The chatscope `Conversation` component already supports `unreadCnt` prop and the CSS styling for the unread dot is already defined in `chatscope-theme.css` (lines 52, 95).

### Anti-Patterns to Avoid
- **Storing unread counts in localStorage/server:** Overkill for a single-user dashboard. In-memory React state is sufficient; counts reset on page reload which is acceptable.
- **Auto-sending on checkpoint button tap:** The requirement explicitly says "inserts the choice" not "sends the choice."
- **Subscribing to eventBus in ChatListView:** Would cause re-renders on every message. Subscribe at the GSD page level and pass counts as props.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unread dot UI | Custom badge | chatscope `unreadCnt` prop | Already styled in theme CSS |
| WebSocket plumbing | New WS subscription | Existing eventBus | Already working end-to-end |
| Text insertion | New input mechanism | Existing `setInputText` + `focus()` | handleChipSelect pattern works |

## Common Pitfalls

### Pitfall 1: Stale closure in eventBus subscription
**What goes wrong:** The eventBus useEffect captures `chatView.project` at mount time. When user switches projects, the subscription still has the old value.
**How to avoid:** Use a ref (`activeProjectRef`) updated on every render, read inside the subscription callback.

### Pitfall 2: Double-counting messages in ChatWindow
**What goes wrong:** ChatWindow already subscribes to `gsd_chat_message` and appends messages. If the GSD page ALSO subscribes for unread counts, there's no conflict -- they serve different purposes. But ensure the ChatWindow subscription and the unread subscription don't interfere.
**How to avoid:** These are independent: ChatWindow manages its own message list, GSD page manages unread counts. No shared state needed.

### Pitfall 3: CheckpointPrompt sends number, not option text
**What goes wrong:** CheckpointPrompt calls `onAction?.(String(i + 1))` -- it sends the option NUMBER (e.g., "1", "2"), not the option text. This is actually correct for GSD prompts where Claude expects a number answer. When rewiring to insert-into-textarea, the number should be inserted.
**How to avoid:** Keep the `String(i + 1)` behavior. The user sees the option text on the button but the inserted value is the number Claude expects.

### Pitfall 4: Mobile vs desktop unread count reset
**What goes wrong:** On mobile, chatView transitions from 'list' to 'chat'. On desktop (3-column), the chat is always visible. When does unread reset?
**How to avoid:** Reset unread count whenever `chatView.project` changes to a project name, regardless of mobile/desktop. On desktop, clicking a project in the list sets `chatView.project`, which triggers the reset.

## Code Examples

### Fix ACT-02: Change onAction from handleSend to handleChipSelect
```typescript
// ChatWindow.tsx line 269 — change:
<ChatMessageRenderer key={msg.id} msg={msg} onAction={handleSend} />
// to:
<ChatMessageRenderer key={msg.id} msg={msg} onAction={handleChipSelect} />
```

### Add unread tracking to GSD.tsx
```typescript
// State
const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
const activeProjectRef = useRef<string | undefined>();
activeProjectRef.current = chatView.project;

// Subscription (in useEffect)
useEffect(() => {
  const unsub = eventBus.subscribe((msg) => {
    if (msg.type !== 'gsd_chat_message') return;
    const evt = msg.data as GsdChatMessageEvent;
    if (evt.project === activeProjectRef.current) return;
    setUnreadCounts(prev => ({
      ...prev,
      [evt.project]: (prev[evt.project] || 0) + 1,
    }));
  });
  return unsub;
}, []);

// Reset on project selection
const handleSelectProject = useCallback((name: string) => {
  setChatView({ view: 'chat', project: name });
  setUnreadCounts(prev => ({ ...prev, [name]: 0 }));
}, []);
```

### Pass unreadCounts to ChatListView
```typescript
<ChatListView
  projects={filteredProjects}
  activeProject={chatView.project}
  onSelectProject={handleSelectProject}
  unreadCounts={unreadCounts}
/>
```

## State of the Art

| Aspect | Current State | What Phase 31 Changes |
|--------|---------------|----------------------|
| Command chips | Insert into textarea (working) | Verify, no change needed |
| Checkpoint buttons | Auto-send on tap (bug) | Rewire to insert into textarea |
| WebSocket streaming | Working end-to-end | Verify, no change needed |
| Unread badges | Hardcoded to 0 | Real-time tracking with eventBus |
| chatscope unread dot | CSS styled but unused | Activated via unreadCnt prop |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (server), Vitest (client) |
| Config file | vitest.config.ts (assumed from npm scripts) |
| Quick run command | `npm run test:server` |
| Full suite command | `npm run test:server && npm run test:client` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACT-01 | Command chip inserts text into textarea | manual-only | N/A - UI interaction | N/A |
| ACT-02 | Checkpoint button inserts choice into textarea | manual-only | N/A - UI interaction | N/A |
| ACT-03 | Unread badge increments for non-active chats | manual-only | N/A - requires WS + UI | N/A |
| INF-03 | Messages stream via WebSocket in real time | unit | `npm run test:server` | server/__tests__/chatMessages.test.js |

Manual-only justification: ACT-01/02/03 are UI interaction behaviors that require a running WebSocket server, tmux classifier producing messages, and visual verification of the chat UI. Integration test setup cost outweighs value for single-user tool.

### Sampling Rate
- **Per task commit:** `npm run test:server`
- **Per wave merge:** `npm run test:server && npm run test:client`
- **Phase gate:** Full suite green + manual verification of all 4 behaviors

### Wave 0 Gaps
None -- existing test infrastructure covers server-side behavior. UI changes are verified manually per project conventions.

## Open Questions

1. **Should unread counts persist across page reloads?**
   - What we know: Single-user local tool, counts are ephemeral
   - Recommendation: No persistence needed. In-memory React state resets on reload, which is acceptable behavior.

2. **Should the active chat auto-scroll when new WebSocket messages arrive?**
   - What we know: Current behavior only scrolls to bottom on initial load (`initialScrollDone` ref prevents subsequent auto-scrolls)
   - Recommendation: Out of scope for Phase 31. Current behavior is intentional (user may be reading history). Could be a future enhancement with "new messages" indicator.

## Sources

### Primary (HIGH confidence)
- Direct code inspection of ChatWindow.tsx, ChatMessageRenderer.tsx, CheckpointPrompt.tsx, CommandChips.tsx, ChatListView.tsx
- Direct code inspection of server/gsd/classifier.js, server/websocket.js
- Direct code inspection of client/src/lib/eventBus.ts, client/src/lib/types.ts
- Direct code inspection of client/src/pages/GSD.tsx (state management, 3-column layout)

### Secondary (MEDIUM confidence)
- chatscope `Conversation` unreadCnt prop -- confirmed via code usage and CSS theme styling

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all code inspected, no new dependencies
- Architecture: HIGH - patterns derived directly from existing codebase
- Pitfalls: HIGH - identified from actual code patterns (stale closures, prop wiring)

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable internal codebase)
