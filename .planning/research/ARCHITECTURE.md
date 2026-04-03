# Architecture: v4.0 Chat-First Dashboard

**Domain:** Chat-based project monitoring UI
**Researched:** 2026-04-03

## Recommended Architecture

v4.0 adds a server-side message classifier and replaces the client-side kanban view with a chat interface. The architecture extends existing patterns -- no new infrastructure, no new databases, no new real-time transport.

### System Overview

```
tmux capture-pane (existing, polling every 5s)
        |
        v
strip-ansi --> classifier module (NEW: server/gsd/classifier.js)
        |
        v
gsd_messages table (EXTENDED: add message_type, metadata columns)
        |
        v
WebSocket broadcast (EXTENDED: chat:message, chat:typing, chat:unread)
        |
        v
React chat UI (NEW: chatscope components + custom message renderers)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Classifier** (`server/gsd/classifier.js`) | Parse tmux plaintext into typed messages. Strip ANSI, match patterns, assign message_type + metadata. | tmux.js (input), db.js (output), websocket.js (broadcast) |
| **ClassifierPoller** (in existing polling loop) | Run classifier on each active project at polling interval. Diff against last-seen output to avoid duplicate messages. | classifier.js, tmux.js |
| **gsd_messages (extended)** | Store classified messages with type and metadata. Source of truth for chat history. | db.js prepared statements |
| **Chat API routes** (`server/routes/chat.js`) | HTTP endpoints for message history, unread counts, mark-as-read. | db.js, gsd_messages table |
| **ChatListView** (client component) | ConversationList showing all projects sorted by recency. Unread badges, state colors. | WebSocket (chat:unread), API (/api/chat/conversations) |
| **ChatWindow** (client component) | ChatContainer with MessageList, typed message renderers, MessageInput. | WebSocket (chat:message), API (/api/chat/messages/:project), send-keys API |
| **Message Renderers** (client components) | Custom renders for each message_type: stage banners, error cards, tappable commands, plain text. | ChatWindow (parent), react-markdown (for text content) |
| **ProjectDetailPanel** (client component) | Slide-out panel on header tap. Contains autopilot controls, file tabs, raw terminal, settings. | Existing GsdDrawer content, refactored into panel |

### Data Flow: Classified Message Creation

```
1. Polling loop fires (every 5s per active project)
2. capturePaneText(sessionName) returns raw tmux output with ANSI codes
3. strip-ansi removes escape sequences --> clean plaintext
4. Classifier diffs against last-seen-hash to find new lines
5. For each new block of output:
   a. Pattern match against classifier rules (stage, error, input_request, etc.)
   b. Create message object: { type, content, metadata, project, direction: 'inbound' }
   c. Insert into gsd_messages via prepared statement
   d. Broadcast via WebSocket: { type: 'chat:message', project, message }
6. Client receives WebSocket message, appends to local message array
7. Chatscope MessageList auto-scrolls to show new message
```

### Data Flow: User Sends Command

```
1. User types in MessageInput or taps command button
2. Client sends POST /api/gsd/terminal/send (existing endpoint)
3. Server dispatches via tmux send-keys (existing)
4. Client also inserts optimistic outbound message into local state
5. Server inserts outbound message into gsd_messages: { direction: 'outbound', type: 'command' }
6. Broadcast via WebSocket confirms message persisted
```

### Data Flow: Unread Tracking

```
1. Server tracks last_read_at per project (new column or separate table)
2. On each new message insert, increment unread count for project
3. Broadcast chat:unread to all connected clients
4. When user opens a project chat, client sends POST /api/chat/mark-read/:project
5. Server resets unread count, broadcasts updated count
```

## Patterns to Follow

### Pattern 1: Classifier as Pure Function

**What:** The classifier takes plaintext input and returns an array of typed message objects. No side effects, no database access, no WebSocket calls.
**When:** Always. The poller handles persistence and broadcasting.
**Why:** Testable in isolation. Can unit test with sample tmux output strings.

```javascript
// server/gsd/classifier.js
function classifyOutput(plaintext) {
  const messages = [];
  const lines = plaintext.split('\n');

  for (const line of lines) {
    if (/^Phase \d+/i.test(line)) {
      messages.push({ type: 'stage', content: line.trim(), metadata: {} });
    } else if (/Error:|FAILED|BLOCKED/i.test(line)) {
      messages.push({ type: 'error', content: line.trim(), metadata: {} });
    } else if (/\?\s/.test(line) || /\(Y\/n\)/i.test(line)) {
      messages.push({ type: 'input_request', content: line.trim(), metadata: {} });
    }
    // ... more patterns
  }
  return messages;
}
```

### Pattern 2: Diff-Based Message Detection

**What:** Hash the last N lines of tmux output. On each poll, only process lines that weren't in the previous hash.
**When:** Every classifier poll cycle.
**Why:** Prevents duplicate messages. Tmux capture-pane returns the full visible buffer every time.

```javascript
// Track last-seen content hash per project
const lastSeen = new Map(); // project -> { hash, lineCount }

function getNewLines(project, currentOutput) {
  const lines = currentOutput.split('\n');
  const hash = simpleHash(currentOutput);
  const prev = lastSeen.get(project);

  if (prev && prev.hash === hash) return []; // no change

  // Find where new content starts (simplified)
  const newLines = prev ? lines.slice(prev.lineCount) : lines;
  lastSeen.set(project, { hash, lineCount: lines.length });
  return newLines;
}
```

### Pattern 3: Chatscope Wrapper Components

**What:** Wrap each chatscope component in a Tailwind-styled container. Never modify chatscope's internal CSS directly.
**When:** Every chatscope component usage.
**Why:** Maintains upgrade path. If chatscope releases updates, wrapper components isolate changes.

```tsx
// client/src/components/chat/ChatList.tsx
import { ConversationList, Conversation } from '@chatscope/chat-ui-kit-react';

export function ChatList({ projects, onSelect }) {
  return (
    <div className="h-full border-r border-border">
      <ConversationList>
        {projects.map(p => (
          <Conversation
            key={p.key}
            name={p.name}
            lastSenderName={p.lastMessage?.type === 'outbound' ? 'You' : 'Claude'}
            info={p.lastMessage?.content?.slice(0, 60)}
            onClick={() => onSelect(p.key)}
          />
        ))}
      </ConversationList>
    </div>
  );
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixing Raw Terminal in Chat

**What:** Dumping unsanitized terminal output directly into chat messages.
**Why bad:** Terminal output contains ANSI codes, cursor movements, partial lines, spinner characters, and progress bars. Rendered as chat messages, this is unreadable garbage.
**Instead:** Always run through strip-ansi + classifier. Only classified output becomes messages. Raw terminal stays in xterm.js overlay.

### Anti-Pattern 2: Polling the Database for New Messages

**What:** Client polling GET /api/chat/messages every N seconds to check for new messages.
**Why bad:** Wasteful, laggy, doesn't scale. Existing WebSocket infrastructure already pushes updates.
**Instead:** Use WebSocket chat:message events for real-time. HTTP API only for initial page load (history) and mark-as-read.

### Anti-Pattern 3: Overriding Chatscope Internals

**What:** Using CSS `!important` or patching chatscope source to change scroll behavior, message layout, etc.
**Why bad:** Breaks on library updates. Creates unmaintainable CSS specificity wars.
**Instead:** Use chatscope's documented customization points (SCSS variables via CSS overrides, Message.CustomContent for custom renders). If a component doesn't support needed customization, replace that specific component with a custom Tailwind one rather than hacking the library.

### Anti-Pattern 4: One Message Per Terminal Line

**What:** Creating a separate chat message for every line of terminal output.
**Why bad:** A single Claude Code response can be 50+ lines. 50 chat bubbles for one response is unusable.
**Instead:** Classifier should group related lines into logical messages. A stage banner is one message. A multi-line error with stack trace is one message. The grouping logic is part of the classifier's responsibility.

## Scalability Considerations

| Concern | Current (6 projects) | At 20 projects | At 100 projects |
|---------|----------------------|-----------------|------------------|
| Classifier polling | 6 tmux captures every 5s. Negligible CPU. | 20 captures/5s. Still fine. | Batch captures, increase interval to 10s. |
| Message storage | ~100 messages/project/day. ~600/day total. SQLite handles easily. | ~2K messages/day. Fine. | Implement message archival (move >30d messages to archive table). |
| WebSocket broadcast | All messages to all clients (1 client typically). Trivial. | Same. | Add project subscription (only send messages for projects client is viewing). |
| Chat list rendering | 6 items. Instant. | 20 items. Instant. | Add search/filter. ConversationList handles scroll. |
| Message list rendering | ~100 messages visible. Chatscope handles scroll. | Same per project. | Paginate history. Load last 50 on open, fetch more on scroll-up. |

## Sources

- Existing codebase: server/gsd/tmux.js (capture-pane, pattern matching), server/db.js (gsd_messages schema), client/src/hooks/useWebSocket.ts
- @chatscope/chat-ui-kit-react Storybook: component APIs and customization patterns
- WhatsApp Web architecture: chat list + detail pattern, unread tracking, message grouping
