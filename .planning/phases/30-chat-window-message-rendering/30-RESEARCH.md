# Phase 30: Chat Window + Message Rendering - Research

**Researched:** 2026-04-04
**Domain:** Chat message rendering, tmux output classification pipeline, chatscope integration
**Confidence:** HIGH

## Summary

Phase 30 replaces the placeholder chat view in GSD.tsx with a full chat window showing classified message history, custom renderers per message type, a message input box wired to tmux send-keys, and a working indicator with context gauge. The foundation is solid: the classifier (classifierPatterns.js) exists with 6 message types, the schema has message_type/metadata columns, chatscope CSS theming is done, and the view-switching state machine in GSD.tsx already toggles between list and chat views.

The core challenge is threefold: (1) building the message classification pipeline that polls tmux, diffs output, classifies chunks, persists to SQLite, and broadcasts via WebSocket; (2) rendering each message type with appropriate custom components inside chatscope's MessageList; and (3) handling scroll behavior, mobile keyboard, and real-time updates correctly. The existing `listVisibleGsdMessages` prepared statement already filters hidden messages at SQL level, and `insertClassifiedMessage` handles persistence with type and metadata.

**Primary recommendation:** Build the server-side classification polling loop first (it populates the database), then build the chat window UI consuming that data, then wire real-time updates. Use chatscope MessageList for scroll management but build all message renderers as custom components (not chatscope's Message component) since each msg_type needs distinct rendering.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-06 | Full chat history with messages parsed from tmux output, displayed as chat bubbles | Classification pipeline + MessageList + listVisibleGsdMessages query + custom renderers |
| CHAT-07 | Message input box that sends text to tmux via send-keys on submit | Reuse existing SendBox pattern from GSD.tsx, wire to POST /api/gsd/projects/:name/send |
| CHAT-08 | Working indicator: pulsing elapsed time, token count, context % gauge | Reuse ContextBar component + detectSessionState working data from project API |
| CHAT-10 | Back button returns to chat list | Already implemented in chatView state machine -- just preserve during refactor |
| MSG-02 | GSD stage banners rendered as system messages (centered, styled) | classifyLine returns stage_banner type -- render as full-width centered divider |
| MSG-03 | Checkpoints/questions with tappable option buttons | classifyLine returns checkpoint type -- parse metadata for options, render buttons |
| MSG-04 | Next Up blocks with command chips | Extend classifier for next_up pattern, render GSD_CHIPS as tappable chips |
| MSG-05 | Completion summaries as Claude messages | classifyLine returns completion type -- render as styled success card |
| MSG-06 | Critical errors red-bordered; minor warnings collapsed | classifyLine returns error type -- render with red border, collapsible for stacks |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| @chatscope/chat-ui-kit-react | ^2.1.1 | MessageList, Message, TypingIndicator | Installed (Phase 28) |
| @chatscope/chat-ui-kit-styles | ^1.4.0 | Base CSS for chatscope components | Installed (Phase 28) |
| strip-ansi | 6.0.1 | ANSI stripping for classifier | Installed (Phase 28) |
| react-markdown + remark-gfm | existing | Markdown in completion summaries | Already in project |

### No New Dependencies Needed

This phase requires zero new npm packages. Everything builds on existing infrastructure.

## Architecture Patterns

### Recommended Project Structure (New Files)

```
server/
  gsd/
    classifier.js            # NEW: TmuxClassifier polling loop
    classifierPatterns.js     # EXISTS: pure classification functions
client/
  src/
    components/
      ChatWindow.tsx          # NEW: main chat view replacing placeholder
      ChatMessageRenderer.tsx # NEW: switch-on-type renderer
      StageBanner.tsx         # NEW: centered phase divider
      ErrorCard.tsx           # NEW: red-bordered error with collapse
      CheckpointPrompt.tsx    # NEW: tappable option buttons
      CompletionCard.tsx      # NEW: success summary card
      WorkingIndicator.tsx    # NEW: pulsing timer + context gauge
      CommandChips.tsx        # NEW: tappable GSD command chips
```

### Pattern 1: Server-Side Classification Pipeline

**What:** TmuxClassifier polls capture-pane every 2.5s per active project, diffs against previous snapshot, classifies new content via classifyChunks(), persists via insertClassifiedMessage, broadcasts via WebSocket.

**When to use:** This is the core data pipeline -- all message rendering depends on it.

```javascript
// server/gsd/classifier.js
const { classifyChunks } = require('./classifierPatterns');
const { capturePaneText } = require('./tmux');

class TmuxClassifier {
  constructor(db, stmts, broadcast) {
    this.stmts = stmts;
    this.broadcast = broadcast;
    this.snapshots = new Map(); // project -> last captured lines
  }

  poll(projectName, tmuxSession) {
    const raw = capturePaneText(tmuxSession);
    if (!raw) return;

    const currentLines = raw.split('\n');
    const prevLines = this.snapshots.get(projectName) || [];

    // Find overlap point -- last N lines of prev that match start of current
    const newContent = this.diffLines(prevLines, currentLines);
    if (!newContent) return;

    this.snapshots.set(projectName, currentLines);

    const chunks = classifyChunks(newContent);
    // Filter out hidden -- already handled by listVisibleGsdMessages but skip DB write too
    const visible = chunks.filter(c => c.msg_type !== 'hidden');
    for (const chunk of visible) {
      try {
        const row = this.stmts.insertClassifiedMessage.get(
          projectName, 'inbound', chunk.content,
          chunk.msg_type, chunk.metadata ? JSON.stringify(chunk.metadata) : null
        );
        this.broadcast('gsd_chat_message', {
          project: projectName,
          message: row
        });
      } catch {}
    }
  }
}
```

### Pattern 2: Custom Message Renderers in ChatWindow

**What:** A switch-on-msg_type component renders each message differently inside chatscope's MessageList.

```tsx
// client/src/components/ChatMessageRenderer.tsx
function ChatMessageRenderer({ msg }: { msg: GsdMessage }) {
  switch (msg.message_type) {
    case 'stage_banner':
      return <StageBanner content={msg.content} />;
    case 'checkpoint':
      return <CheckpointPrompt content={msg.content} metadata={msg.metadata} />;
    case 'completion':
      return <CompletionCard content={msg.content} />;
    case 'error':
      return <ErrorCard content={msg.content} />;
    default: // 'text'
      return (
        <Message model={{
          message: msg.content,
          direction: msg.direction === 'outbound' ? 'outgoing' : 'incoming',
          position: 'single',
        }} />
      );
  }
}
```

### Pattern 3: Chat Window State + Data Loading

**What:** ChatWindow loads history on mount via API, subscribes to WebSocket for real-time updates.

```tsx
// client/src/components/ChatWindow.tsx
function ChatWindow({ projectName, onBack }: Props) {
  const [messages, setMessages] = useState<GsdMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Load initial history
  useEffect(() => {
    api.gsd.messages(projectName, 100, 0).then(({ messages }) => {
      setMessages(messages.reverse()); // API returns DESC, we need ASC
      setLoading(false);
    });
  }, [projectName]);

  // Real-time updates via eventBus
  useEffect(() => {
    return eventBus.subscribe((msg) => {
      if (msg.type === 'gsd_chat_message') {
        const data = msg.data as { project: string; message: GsdMessage };
        if (data.project === projectName) {
          setMessages(prev => [...prev, data.message]);
        }
      }
    });
  }, [projectName]);
}
```

### Pattern 4: Railway Proxy for New Endpoints

Every new route MUST follow the GSD_DATA_URL proxy pattern from server/routes/gsd.js.

### Anti-Patterns to Avoid

- **One bubble per terminal line:** The classifier MUST group related lines. Stage banners, multi-line errors, and text blocks between markers are single messages.
- **chatscope MessageInput:** Has known contentEditable bugs (#174). Use the existing SendBox component from GSD.tsx which already works with tmux send-keys.
- **Client-side classification:** All classification happens server-side. Client receives typed messages only.
- **Dual message reads:** Use `listVisibleGsdMessages` exclusively. Do NOT also read from `listGsdMessages`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll-to-bottom behavior | Custom scroll logic | chatscope MessageList | Handles sticky bottom, auto-scroll detection, scroll anchoring |
| ANSI stripping | Regex `\x1b\[[0-9;]*m` | strip-ansi (already installed) | Handles CSI, OSC, ACS, DCS sequences correctly |
| Relative timestamps | Custom date logic | timeAgo utility (already built Phase 29) | Covers all cases, tested |
| Message type routing | if/else chain | Switch-based renderer component | Extensible, one place to add types |
| Tmux send-keys | Custom terminal bridge | Existing POST /api/gsd/:name/send | Already handles GSD_DATA_URL proxy, insertGsdMessage logging |

## Common Pitfalls

### Pitfall 1: Message Deduplication in Polling Loop

**What goes wrong:** capture-pane returns the visible pane (~24-50 lines). Same lines appear in consecutive captures until they scroll off. Without dedup, chat fills with duplicates.
**Why it happens:** capture-pane is a snapshot, not a stream.
**How to avoid:** Line-offset tracking: store previous capture lines, find overlap point in current capture, only process lines after overlap. Use `capture-pane -p -S -` for full scrollback if needed.
**Warning signs:** Same message appearing 5-10 times in chat history.

### Pitfall 2: Scroll Position Hijacking

**What goes wrong:** New messages snap viewport to bottom even when user is reading history.
**Why it happens:** chatscope MessageList auto-scrolls by default.
**How to avoid:** chatscope MessageList has `autoScrollToBottomOnMount` and built-in sticky-bottom detection. Verify it works correctly. If not, implement: auto-scroll only when within ~50px of bottom, show "New messages" pill when scrolled up.
**Warning signs:** Cannot read chat history while Claude is working.

### Pitfall 3: Mobile Virtual Keyboard Pushing Layout

**What goes wrong:** Keyboard appears, pushes input off-screen or hides messages.
**How to avoid:** The existing SendBox already handles mobile with `position: fixed` when focused + `fontSize: 16` to prevent iOS zoom. Reuse this pattern in ChatWindow. Use `dvh` units for container height.
**Warning signs:** Cannot see input while typing on mobile.

### Pitfall 4: chatscope CSS Overrides for Message Components

**What goes wrong:** MessageList and Message components have chatscope's default styling that clashes with dark mode.
**How to avoid:** Add message-specific CSS overrides to chatscope-theme.css using the same `:root .cs-*` specificity pattern established in Phase 29. Override `.cs-message`, `.cs-message-list`, `.cs-message__content`, `.cs-typing-indicator`.
**Warning signs:** White backgrounds on message bubbles in dark mode.

### Pitfall 5: Working Indicator Data Source

**What goes wrong:** contextTokens is noted as "inaccurate (cumulative vs current prompt)" in GSD.tsx comments.
**How to avoid:** Use `last_input_tokens` from token_usage table (added in migration) for current context window size, not cumulative `input_tokens`. The timer/duration comes from detectSessionState() data already in the project API response.
**Warning signs:** Context gauge showing >100% or wildly fluctuating.

### Pitfall 6: WebSocket Type Union Not Extended

**What goes wrong:** TypeScript compilation fails because `gsd_chat_message` is not in WSMessage.type union.
**How to avoid:** Add `"gsd_chat_message"` to the WSMessage type union in types.ts AND add the corresponding data type.
**Warning signs:** TypeScript errors on eventBus.subscribe callback.

## Code Examples

### Stage Banner (Centered System Message)

```tsx
// client/src/components/StageBanner.tsx
export function StageBanner({ content }: { content: string }) {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs font-semibold text-accent uppercase tracking-wide">
        {content}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
```

### Error Card (Red Border + Collapsible)

```tsx
// client/src/components/ErrorCard.tsx
export function ErrorCard({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split('\n');
  const preview = lines.slice(0, 3).join('\n');
  const hasMore = lines.length > 3;

  return (
    <div className="mx-4 my-1 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
      <pre className="text-xs text-red-400 whitespace-pre-wrap font-mono">
        {expanded ? content : preview}
      </pre>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-red-400/60 mt-1 hover:text-red-400"
        >
          {expanded ? 'Collapse' : `+${lines.length - 3} more lines`}
        </button>
      )}
    </div>
  );
}
```

### Checkpoint Prompt (Tappable Buttons)

```tsx
// client/src/components/CheckpointPrompt.tsx
export function CheckpointPrompt({
  content,
  metadata,
  onSend,
}: {
  content: string;
  metadata?: Record<string, unknown> | null;
  onSend: (text: string) => void;
}) {
  const options = (metadata?.options as string[]) || [];
  return (
    <div className="mx-4 my-1 p-3 rounded-lg border border-amber-400/30 bg-amber-400/5">
      <p className="text-sm text-gray-200 mb-2">{content}</p>
      {options.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onSend(String(i + 1))}
              className="text-left px-3 py-1.5 rounded border border-amber-400/20
                         bg-amber-400/5 text-sm text-amber-300 hover:bg-amber-400/10
                         active:scale-[0.98] transition-all"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Working Indicator

```tsx
// client/src/components/WorkingIndicator.tsx
export function WorkingIndicator({
  sessionUpdatedAt,
  contextTokens,
}: {
  sessionUpdatedAt: string | null;
  contextTokens: number | null;
}) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!sessionUpdatedAt) return;
    const interval = setInterval(() => {
      const ms = Date.now() - new Date(sessionUpdatedAt).getTime();
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setElapsed(`${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionUpdatedAt]);

  const CONTEXT_WINDOW = 200_000;
  const pct = contextTokens ? Math.min(contextTokens / CONTEXT_WINDOW, 1) : 0;
  const hue = Math.round(120 * (1 - pct));

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/5 border-b border-emerald-500/20">
      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      <span className="text-xs text-emerald-400">Working... {elapsed}</span>
      {contextTokens != null && (
        <>
          <span className="text-xs text-gray-500">Context:</span>
          <div className="w-16 h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct * 100}%`, backgroundColor: `hsl(${hue}, 70%, 45%)` }}
            />
          </div>
          <span className="text-[10px]" style={{ color: `hsl(${hue}, 70%, 55%)` }}>
            {Math.round(pct * 100)}%
          </span>
        </>
      )}
    </div>
  );
}
```

### TmuxClassifier Diff Strategy

```javascript
// server/gsd/classifier.js - diff approach
diffLines(prevLines, currentLines) {
  if (prevLines.length === 0) {
    return currentLines.join('\n');
  }

  // Find the last line of prevLines in currentLines
  // Walk backward from end of currentLines to find overlap
  const lastPrev = prevLines[prevLines.length - 1];
  let overlapEnd = -1;

  for (let i = currentLines.length - 1; i >= 0; i--) {
    if (currentLines[i] === lastPrev) {
      // Verify preceding lines match too (at least 2 lines for confidence)
      const checkCount = Math.min(3, prevLines.length);
      let match = true;
      for (let j = 1; j < checkCount; j++) {
        if (currentLines[i - j] !== prevLines[prevLines.length - 1 - j]) {
          match = false;
          break;
        }
      }
      if (match) {
        overlapEnd = i;
        break;
      }
    }
  }

  if (overlapEnd === -1) {
    // No overlap found -- all lines are new (fast scroll case)
    return currentLines.join('\n');
  }

  const newLines = currentLines.slice(overlapEnd + 1);
  return newLines.length > 0 ? newLines.join('\n') : null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| listGsdMessages (no type filter) | listVisibleGsdMessages (excludes hidden) | Phase 28 | Chat never shows tool calls, code output |
| insertGsdMessage (text only) | insertClassifiedMessage (with type/metadata) | Phase 28 | Messages carry classification data |
| Kanban project grid | ConversationList chat rows | Phase 29 | Chat-first navigation pattern |
| Placeholder chat view | Full ChatWindow (this phase) | Phase 30 | Core feature delivery |

## Open Questions

1. **Classifier polling integration point**
   - What we know: Server has a 2-minute maintenance sweep in index.js. Classifier needs 2.5s interval.
   - What's unclear: Should classifier run inside existing maintenance loop (too slow) or as separate setInterval?
   - Recommendation: Separate setInterval(2500) in server/index.js, only polling active (non-archived, non-paused, tmuxActive) projects.

2. **Message grouping granularity**
   - What we know: classifyChunks processes line-by-line. Multiple consecutive 'text' lines should be one message.
   - What's unclear: How aggressively to group -- time-based (2s window) or marker-based (group between non-text types)?
   - Recommendation: Group consecutive same-type lines into single messages in the classifier. Stage banners always break groups.

3. **Checkpoint metadata extraction**
   - What we know: classifyLine returns checkpoint with content but metadata is always null currently.
   - What's unclear: How to extract numbered options from checkpoint content for tappable buttons.
   - Recommendation: Add metadata extraction in classifyChunks -- when a checkpoint is detected, scan following lines for numbered options pattern (1. Foo, 2. Bar) and attach as metadata.options array.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (server) + Vitest (client) |
| Config file | none (server uses --test flag) / client/vitest.config.ts |
| Quick run command | `node --test server/__tests__/classifier.test.js` |
| Full suite command | `npm run test:server && npm run test:client` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-06 | Messages load from API and render in chat | unit | `cd client && npx vitest run src/components/__tests__/ChatWindow.test.tsx` | Wave 0 |
| CHAT-07 | Send box dispatches to tmux send-keys API | unit | `cd client && npx vitest run src/components/__tests__/ChatWindow.test.tsx` | Wave 0 |
| CHAT-08 | Working indicator shows elapsed time + context gauge | unit | `cd client && npx vitest run src/components/__tests__/WorkingIndicator.test.tsx` | Wave 0 |
| CHAT-10 | Back button returns to list view | unit | Existing GSD.tsx view-switching test (manual) | manual-only |
| MSG-02 | Stage banners render as centered dividers | unit | `cd client && npx vitest run src/components/__tests__/ChatMessageRenderer.test.tsx` | Wave 0 |
| MSG-03 | Checkpoint prompts render tappable buttons | unit | `cd client && npx vitest run src/components/__tests__/CheckpointPrompt.test.tsx` | Wave 0 |
| MSG-04 | Next-up blocks render command chips | unit | `cd client && npx vitest run src/components/__tests__/CommandChips.test.tsx` | Wave 0 |
| MSG-05 | Completion summaries render as success cards | unit | `cd client && npx vitest run src/components/__tests__/ChatMessageRenderer.test.tsx` | Wave 0 |
| MSG-06 | Errors red-bordered, warnings collapsed | unit | `cd client && npx vitest run src/components/__tests__/ErrorCard.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test server/__tests__/classifier.test.js`
- **Per wave merge:** `npm run test:server && npm run test:client`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/tmuxClassifier.test.js` -- covers TmuxClassifier polling, diffing, persistence
- [ ] `client/src/components/__tests__/ChatMessageRenderer.test.tsx` -- covers MSG-02, MSG-05, MSG-06
- [ ] `client/src/components/__tests__/CheckpointPrompt.test.tsx` -- covers MSG-03
- [ ] `client/src/components/__tests__/WorkingIndicator.test.tsx` -- covers CHAT-08

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `server/gsd/classifierPatterns.js`, `server/db.js`, `client/src/pages/GSD.tsx`, `client/src/components/ChatListView.tsx`, `client/src/lib/types.ts`, `client/src/lib/api.ts`, `client/src/lib/eventBus.ts`, `server/websocket.js`, `server/routes/gsd.js`
- Phase 28-01 SUMMARY: schema migration, prepared statements confirmed
- Phase 28-02 SUMMARY: classifier patterns confirmed with 23 tests
- Phase 29-01 SUMMARY: chatscope theme CSS, timeAgo utility, lastMessage API
- Phase 29-02 SUMMARY: ChatListView, view switching, mobile terminal new-tab pattern

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` -- server/client data flow, Railway proxy pattern
- `.planning/research/PITFALLS.md` -- scroll, dedup, mobile keyboard, chatscope CSS issues
- `.planning/research/STACK.md` -- chatscope component selection, Message.CustomContent approach
- `.planning/research/FEATURES.md` -- message type classification strategy

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all dependencies already installed and verified
- Architecture: HIGH - data flow clear from codebase analysis, patterns established in Phase 28-29
- Pitfalls: HIGH - documented in prior research, mitigation strategies verified against codebase
- Classification pipeline: MEDIUM - TmuxClassifier diff logic needs validation with real tmux output

**Research date:** 2026-04-04
**Valid until:** 2026-04-14 (stable -- all infrastructure in place)
