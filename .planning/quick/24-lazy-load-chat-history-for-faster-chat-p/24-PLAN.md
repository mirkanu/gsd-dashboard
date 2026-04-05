---
phase: quick
plan: 24
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/components/ChatWindow.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Chat window opens quickly — only the most recent 50 messages are fetched initially"
    - "A 'Load older messages' button appears at the top when there are more messages"
    - "Clicking the button loads the next batch without losing scroll position"
    - "Switching projects resets to latest messages (no stale offset state)"
    - "New real-time messages still append at the bottom as before"
  artifacts:
    - path: "client/src/components/ChatWindow.tsx"
      provides: "Lazy-loaded paginated chat history with load-more UX"
  key_links:
    - from: "ChatWindow.tsx"
      to: "/api/gsd/projects/:name/messages"
      via: "api.gsd.messages(projectName, 50, offset)"
      pattern: "offset state increments by 50 on each load-more"
---

<objective>
Implement lazy-loading of chat history in ChatWindow — only fetch the 50 most recent messages on open, with a "Load older messages" button at the top to page back through history.

Purpose: Reduce initial load time when switching between chats with large message histories. The API already supports limit/offset pagination and returns a `total` count.
Output: ChatWindow.tsx updated with paginated message fetching and load-more UX.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@client/src/components/ChatWindow.tsx
@client/src/lib/api.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add paginated message loading to ChatWindow</name>
  <files>client/src/components/ChatWindow.tsx</files>
  <action>
Modify ChatWindow.tsx to lazy-load messages with these changes:

**State additions:**
- `const [offset, setOffset] = useState(0)` — tracks how many messages have been loaded beyond the initial batch
- `const [total, setTotal] = useState(0)` — total message count from API response
- `const [loadingMore, setLoadingMore] = useState(false)` — loading state for the load-more button

**Change initial fetch (line ~106):**
- Change `api.gsd.messages(projectName, 100, 0)` to `api.gsd.messages(projectName, 50, 0)`
- Store `res.total` into the `total` state
- Reset `offset` to 0 when projectName changes (add to existing project-change useEffect or add new one)

**Add `loadMore` callback:**
```typescript
const loadMore = useCallback(async () => {
  if (loadingMore) return;
  setLoadingMore(true);
  const nextOffset = offset + 50;
  try {
    const res = await api.gsd.messages(projectName, 50, nextOffset);
    // API returns DESC (newest first) — reverse for chronological, then prepend
    const older = res.messages.reverse();
    setMessages((prev) => [...older, ...prev]);
    setOffset(nextOffset);
  } catch {
    // silent
  } finally {
    setLoadingMore(false);
  }
}, [projectName, offset, loadingMore]);
```

**Preserve scroll position when prepending:**
Before `setMessages` in `loadMore`, capture `scrollContainerRef.current?.scrollHeight` into a local variable. After React re-renders, restore by setting `scrollTop` to `newScrollHeight - capturedScrollHeight`. Use a `useLayoutEffect` or inline `requestAnimationFrame` call:

```typescript
const scrollContainer = scrollContainerRef.current;
const prevScrollHeight = scrollContainer?.scrollHeight ?? 0;
setMessages((prev) => [...older, ...prev]);
setOffset(nextOffset);
// Restore scroll after DOM update
requestAnimationFrame(() => {
  if (scrollContainer) {
    const newScrollHeight = scrollContainer.scrollHeight;
    scrollContainer.scrollTop = newScrollHeight - prevScrollHeight;
  }
});
```

**`hasMore` derived value:**
```typescript
const hasMore = messages.length + offset < total;
```
Wait — the offset approach is backwards. The API returns newest messages at offset=0 DESC. So initial fetch gets newest 50. Load-more should fetch the NEXT 50 older messages, which is at offset = (total - already loaded) going further DESC, but actually offset just keeps incrementing: first fetch offset=0 (newest 50), second fetch offset=50 (next 50 older), etc.

Correct `hasMore`:
```typescript
const hasMore = total > messages.length;
```
Where `messages.length` grows as you load more batches (real-time appended messages may inflate this slightly, which is fine — the button just won't show when all historical messages are loaded).

**Add "Load older messages" button at top of message list:**
In the messages area JSX, before `messages.map(...)`, render:
```tsx
{hasMore && (
  <div className="flex justify-center pt-2 pb-1">
    <button
      onClick={loadMore}
      disabled={loadingMore}
      className="text-xs px-3 py-1.5 rounded-full border border-border text-gray-400 hover:text-gray-200 hover:bg-surface-3 disabled:opacity-40 transition-colors"
    >
      {loadingMore ? "Loading..." : "Load older messages"}
    </button>
  </div>
)}
```

**Reset on project change:**
In the existing project-change useEffect (the one that resets `showReopenConfirm`), also reset `offset` to 0 and `total` to 0. The initial fetch useEffect already resets messages on projectName change.

Also update the feedback error-revert refetch to use limit 50 (not 100):
```typescript
const res = await api.gsd.messages(projectName, 50, 0);
```
And reset offset/total from that response too.
  </action>
  <verify>
    <automated>npm run test:client</automated>
  </verify>
  <done>
- Chat window fetches only 50 messages on initial load (not 100)
- "Load older messages" button appears at top when total > loaded count
- Clicking button appends older messages to the top without jumping scroll position
- Switching projects resets offset/total, fetches fresh latest 50
- Real-time new messages still append at the bottom
  </done>
</task>

</tasks>

<verification>
1. `npm run test:client` passes
2. `npm run build` succeeds with no TypeScript errors
3. Manually verify (at live URL after deploy): open a chat with 50+ messages, confirm "Load older messages" button is visible, click it, confirm older messages prepend without scroll jump, confirm switching projects resets the state
</verification>

<success_criteria>
- Initial chat load fetches 50 messages (was 100)
- "Load older messages" button visible when history has more than 50 messages
- Each load-more click prepends 50 more without disrupting scroll position
- Project switching resets pagination cleanly
- All existing client tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/24-lazy-load-chat-history-for-faster-chat-p/24-SUMMARY.md`
</output>
