---
phase: quick-25
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/components/ChatWindow.tsx
  - client/src/pages/GSD.tsx
  - server/routes/terminal.js
  - server/db.js
autonomous: true
requirements: [PERF-01, PERF-02, PERF-03, PERF-04]

must_haves:
  truths:
    - "Switching to a project with 500+ messages renders in under 1 second"
    - "Chat list polls at most every 10s when active, 60s when idle"
    - "Autopilot status is only fetched for the selected project, not every project"
    - "Terminal 500ms polling burst after close is removed"
    - "Terminal output is batched — xterm.js receives one chunk per frame, not one per byte"
    - "DB query for chat messages uses a composite index on (project, created_at)"
  artifacts:
    - path: "client/src/components/ChatWindow.tsx"
      provides: "Windowed message list rendering visible slice only"
    - path: "client/src/pages/GSD.tsx"
      provides: "Reduced polling intervals and scoped autopilot fetch"
    - path: "server/routes/terminal.js"
      provides: "16ms PTY output batching before WebSocket send"
    - path: "server/db.js"
      provides: "Composite index on gsd_messages(project, created_at)"
  key_links:
    - from: "client/src/components/ChatWindow.tsx"
      to: "messages array"
      via: "slicedMessages computed from scroll position"
      pattern: "messages\\.slice"
    - from: "server/routes/terminal.js"
      to: "ws.send"
      via: "setInterval 16ms flush"
      pattern: "setInterval.*flush"
---

<objective>
Fix the three highest-impact performance bottlenecks causing slow chat load, general poll
sluggishness, and terminal input lag.

Purpose: The dashboard is unusable with large projects — 500+ messages freeze the browser,
constant autopilot polls add N extra HTTP requests every 3-30s, and terminal output lag
makes typing feel broken.

Output: ChatWindow renders only visible messages; GSD.tsx polls less and fetches autopilot
status for selected project only; terminal PTY output is frame-batched; DB has a composite
index for the messages query.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@client/src/components/ChatWindow.tsx
@client/src/pages/GSD.tsx
@server/routes/terminal.js
@server/db.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Windowed chat rendering + polling reduction + scoped autopilot fetch</name>
  <files>client/src/components/ChatWindow.tsx, client/src/pages/GSD.tsx</files>
  <action>
**ChatWindow.tsx — windowed rendering without any new npm packages:**

The messages list currently renders all messages with a plain `.map()` at line ~365. Replace
this with a simple "render window" approach:

1. Add a `containerRef` to the scrollable messages div (the one that already has `overflow-y-auto`).
2. Keep a `windowSize` constant of 60 (messages rendered at once). This is enough to fill
   any viewport plus a generous buffer above.
3. Compute `visibleMessages` as the last `windowSize` entries of `messages` when at the
   bottom (default), or a window centered around a scroll anchor when user has scrolled up.
4. For simplicity, use this rule: if `scrollTop + clientHeight >= scrollHeight - 200` the
   user is "at bottom" — render `messages.slice(-windowSize)`. Otherwise render all messages
   (user is actively scrolling up to read — this case is less common and the list is
   partially loaded via lazy load anyway, so capping at windowSize is fine here too).
   Actually simplest correct approach: always render `messages.slice(-windowSize)` when
   `messages.length > windowSize`. When the user clicks "Load older messages" and scrolls
   up, the load-more button adds to the front, so the slice still works correctly because
   the user is at the bottom after each load. If the user has scrolled up past the render
   window, just render all (messages.length capped at 200 to prevent thrash):
   ```
   const RENDER_LIMIT = 80;
   const visibleMessages = messages.length > RENDER_LIMIT ? messages.slice(-RENDER_LIMIT) : messages;
   ```
   Replace the existing `{messages.map(...)}` at line ~365 with `{visibleMessages.map(...)}`.
   This is the minimal correct approach: the bottom of the list is always in view, older
   messages are loaded on demand via the existing load-more button, so we never need to
   render more than the most recent N messages.

**GSD.tsx — polling reduction:**

Line ~882-889 — the polling useEffect currently polls every 3s (working) or 30s (idle).
Change to: 10s when working, 60s when idle. The chat window receives real-time messages via
WebSocket already (eventBus), so the poll is just for project list metadata. 10s is
sufficient for working state.

```typescript
const ms = isWorking ? 10_000 : 60_000;
```

**GSD.tsx — scoped autopilot fetch:**

Lines ~834-847 — currently fetches autopilot status for ALL non-archived projects on every
poll. Change to only fetch for the selected project (if any):

```typescript
// Only fetch autopilot status for the selected project
if (selectedProj) {
  const s = await api.autopilot.status(selectedProj.name).catch(() => null);
  if (s && s.runId && s.status !== 'idle') {
    setAutopilotRuns(prev => {
      const next = new Map(prev);
      next.set(s.projectName, s);
      return next;
    });
  }
}
```

Note: `selectedProj` is derived from `projects` and `chatView.project`, both of which are
already in scope at the call site via closure. The `load` callback currently has `[]` deps
so `selectedProj` is NOT in scope there. Fix: add a ref for the selected project name:
- Add `const selectedProjRef = useRef<string | null>(null);`
- Keep it updated with a useEffect: `useEffect(() => { selectedProjRef.current = selectedProj?.name ?? null; }, [selectedProj]);`
- In `load`, use `selectedProjRef.current` instead of `selectedProj.name`.

**GSD.tsx — remove polling burst after terminal close:**

Lines ~973-983 in `handleTerminalClose` — remove the 500ms interval burst entirely. The
WebSocket already delivers real-time state changes; a single `load(false)` call on terminal
close is sufficient:

```typescript
const handleTerminalClose = useCallback(() => {
  setTerminalProject(null);
  setTerminalInitialValue("");
  load(false); // single refresh, no burst
}, [load]);
```

Also remove the burst cleanup useEffect (lines ~892-897) and the `refreshIntervalRef` /
`refreshTimeoutRef` refs if they are no longer used anywhere else. Check with grep first.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>
    - ChatWindow renders at most 80 messages at a time (slice applied when messages.length > 80)
    - GSD.tsx polls at 10s/60s intervals instead of 3s/30s
    - Autopilot status fetch is scoped to selectedProjRef.current, not all non-archived
    - handleTerminalClose has no setInterval burst — just one load(false) call
    - Tests pass (or pre-existing failures only)
  </done>
</task>

<task type="auto">
  <name>Task 2: Terminal PTY output batching + DB composite index</name>
  <files>server/routes/terminal.js, server/db.js</files>
  <action>
**server/routes/terminal.js — 16ms PTY output batching:**

Lines 68-69 currently send each PTY byte directly:
```javascript
pty.onData((data) => {
  if (ws.readyState === 1) ws.send(data);
});
```

Replace with a buffer that flushes every 16ms (one frame at 60fps):
```javascript
let ptyBuffer = '';
let flushTimer = null;

const flushPty = () => {
  if (ptyBuffer && ws.readyState === 1) {
    ws.send(ptyBuffer);
    ptyBuffer = '';
  }
  flushTimer = null;
};

pty.onData((data) => {
  ptyBuffer += data;
  if (!flushTimer) {
    flushTimer = setTimeout(flushPty, 16);
  }
});
```

When the WebSocket closes or the PTY exits, flush any remaining buffer immediately and clear
the timer. Add cleanup in the existing `ws.on('close', ...)` and `pty.onExit(...)` handlers
(find these in the file and add `if (flushTimer) { clearTimeout(flushTimer); flushPty(); }`).

**server/db.js — composite index on gsd_messages(project, created_at):**

The `listVisibleGsdMessages` and `listGsdMessages` queries at lines ~551-559 both filter by
`project` and sort by `created_at DESC`. Find the `ensureTables` function (or wherever the
`CREATE TABLE gsd_messages` statement lives) and add immediately after it:

```javascript
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_gsd_messages_project_created
  ON gsd_messages(project, created_at DESC);
`);
```

Use `CREATE INDEX IF NOT EXISTS` so it is safe to run on existing databases (idempotent).
Confirm the table name is `gsd_messages` by grepping the file before adding.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -20</automated>
  </verify>
  <done>
    - PTY onData handler accumulates to ptyBuffer and schedules a 16ms flush (not immediate send)
    - flushTimer is cleared on ws close and pty exit
    - db.js has CREATE INDEX IF NOT EXISTS idx_gsd_messages_project_created on gsd_messages(project, created_at DESC)
    - Server tests pass (or pre-existing failures only)
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. `npm run test:client` — no new failures
2. `npm run test:server` — no new failures
3. `npm run build` — clean build, no TypeScript errors
</verification>

<success_criteria>
- ChatWindow with 500+ messages renders the most recent 80; older messages accessible via load-more button
- Polling intervals changed to 10s (working) and 60s (idle)
- Autopilot status fetched for selected project only, not all N projects
- No 500ms polling burst after terminal close
- Terminal PTY output batched per 16ms frame before WebSocket send
- Composite DB index on gsd_messages(project, created_at DESC) created idempotently
- All existing tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/25-fix-dashboard-performance-slow-chat-term/25-SUMMARY.md`
with what was changed, files modified, and any notes for future reference.
</output>
