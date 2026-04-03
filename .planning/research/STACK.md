# Technology Stack: v4.0 Chat-First Dashboard

**Project:** GSD Dashboard Chat Redesign
**Researched:** 2026-04-03
**Scope:** NEW additions only. Existing validated stack (React 18, Vite 6, Express, SQLite/better-sqlite3, ws, xterm.js, node-pty, Tailwind CSS 3, lucide-react, react-router-dom) is not re-evaluated.

## Recommended Stack Additions

### Chat UI Components (Client)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @chatscope/chat-ui-kit-react | ^2.1.1 | Chat container, message list, message bubbles, conversation list, typing indicator | Production-tested chat UI primitives. Handles hard UX problems (sticky scroll-to-bottom, auto-scroll on new messages, message grouping by sender/time, typing indicators) that are painful and bug-prone to build from scratch. Peer deps: React 16-19, prop-types. MIT licensed. 1.7k stars, 16k weekly npm downloads. |
| @chatscope/chat-ui-kit-styles | ^1.4.0 | Base CSS theme for chatscope components | Required companion to chat-ui-kit-react. Ships pre-compiled CSS (`styles.min.css`) -- no SCSS build step needed. Import the compiled CSS once, override with Tailwind utilities and CSS custom properties where needed. |

**Tailwind coexistence strategy:** Chatscope uses BEM-namespaced classes (`.cs-message`, `.cs-conversation-list`, `.cs-message-input`). These do not collide with Tailwind utility classes. The integration pattern is:

1. Import `@chatscope/chat-ui-kit-styles/dist/default/styles.min.css` in the Vite entry point
2. Wrap chatscope components in Tailwind-styled `<div>` containers for layout and spacing
3. Override chatscope theme colors via CSS custom property overrides scoped to `.dark` class for dark mode support
4. Do NOT attempt to rewrite chatscope component internals in Tailwind -- use their CSS as the rendering base

**Dark mode:** Chatscope's default theme is light-only. Apply CSS overrides targeting `.cs-*` selectors inside a `.dark` parent. Approximately 20-30 CSS variable overrides needed (backgrounds, text colors, borders, input backgrounds). This is a one-time stylesheet, not per-component work.

**Risk mitigation:** If chatscope proves too rigid for custom message types (tappable commands, stage banners), its components can be progressively replaced with custom Tailwind components. The data layer (WebSocket messages, SQLite persistence) is independent of the UI library. Start with chatscope for ConversationList and MessageList scroll behavior; build custom message renderers for specialized message types within chatscope's `Message.CustomContent`.

### Terminal Output Processing (Server)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| strip-ansi | 6.0.1 | Remove ANSI escape codes from tmux capture-pane output for classification | The tmux output contains ANSI color/cursor codes that must be stripped before regex pattern matching. strip-ansi is the standard tool (600M+ weekly downloads, zero deps). **Use version 6.0.1 specifically** -- it is the last CommonJS-compatible version. v7+ is ESM-only and the server uses `require()`. |

**Why not ansi_up or ansi-to-html?** Those convert ANSI to styled HTML for display. We do not need that -- xterm.js already handles raw terminal rendering. The classifier needs clean plaintext for pattern matching. Classified results get rendered as chat message components, not as terminal HTML. strip-ansi is the right tool for this job.

**Why not ansi-regex directly?** strip-ansi already uses ansi-regex internally. Importing ansi-regex to manually `.replace()` is reimplementing strip-ansi with extra steps.

### Message Classification (Server -- No New Dependency)

Build a custom classifier as a server module (`server/gsd/classifier.js`) using regex pattern matching. No NLP or ML library needed. The patterns are specific to Claude Code / GSD output:

| Message Type | Detection Pattern | Example |
|-------------|-------------------|---------|
| `stage` | `Phase \d+`, `PLAN:`, `EXECUTE:`, `RESEARCH:` | "Phase 3: Execute migration" |
| `checkpoint` | Checkmark lines, progress percentages, `Step \d+ of \d+` | "Step 3 of 5 complete" |
| `completion` | `PHASE COMPLETE`, `SUMMARY:`, success banners | "PHASE COMPLETE -- all tests pass" |
| `error` | `Error:`, `BLOCKED`, stack traces, `FAILED` | "Error: npm test failed with exit code 1" |
| `input_request` | `? `, `Do you want`, `(Y/n)`, multi-choice `>` | "? Continue with phase 4? (Y/n)" |
| `rate_limit` | Existing patterns in `server/gsd/tmux.js` | "Rate limit exceeded, try again in 2 hours" |
| `working` | Spinner patterns, tool use lines, `Reading`, `Writing` | "Reading server/db.js..." |
| `text` | Default fallback | Any unclassified output |

The existing `server/gsd/tmux.js` already has pattern matching for rate limits and state detection. The classifier extends these patterns rather than replacing them.

### Message Persistence (No New Dependency -- Schema Extension)

The existing `gsd_messages` table already stores per-project messages with direction and timestamp. Extend via migration:

```sql
ALTER TABLE gsd_messages ADD COLUMN message_type TEXT DEFAULT 'text';
ALTER TABLE gsd_messages ADD COLUMN metadata TEXT;
```

- `message_type`: `'text'|'stage'|'checkpoint'|'completion'|'error'|'input_request'|'command'|'system'|'rate_limit'|'working'`
- `metadata`: JSON blob for structured data (choices array for input_request, phase info for stage banners, error details)

Follow the existing migration pattern in `server/db.js` (try SELECT, catch, ALTER TABLE). No new ORM, query builder, or migration tool needed.

### Real-Time Chat Streaming (No New Dependency -- Protocol Extension)

Extend the existing `ws` WebSocket protocol with new message types:

```javascript
// New WS message types for chat
{ type: 'chat:message', project: string, message: { id, type, content, metadata, created_at } }
{ type: 'chat:typing',  project: string, active: boolean }
{ type: 'chat:unread',  project: string, count: number }
```

The existing `useWebSocket` hook on the client handles reconnection and message dispatch. Add chat message types to the discriminated union in `client/src/lib/types.ts`.

No Socket.IO, no Pusher, no additional real-time library needed.

## What NOT to Add

| Temptation | Why Avoid | What to Do Instead |
|------------|-----------|-------------------|
| Socket.IO | Already using raw `ws`. Socket.IO adds 40KB+ bundle for rooms/namespaces this single-user app does not need. | Extend existing `ws` message types |
| @chatscope/use-chat | Chatscope's state management hook. Over-engineered for this use case -- it assumes a generic chat app, not a dashboard consuming classified terminal output. Would fight with existing React state + WebSocket patterns. | useState/useReducer for message arrays, WebSocket for updates |
| react-virtuoso or react-window | For virtualizing long message lists. Chatscope's MessageList already handles scroll behavior internally. | Only add if performance degrades with 1000+ messages per project (unlikely given pagination) |
| date-fns or dayjs | For relative timestamps ("2m ago"). | Write a 20-line `timeAgo()` utility. The project already avoids date libraries. |
| DOMPurify | For sanitizing message HTML. | Messages are classified server-side and rendered as React components with text content -- no `dangerouslySetInnerHTML` needed. |
| sass / node-sass | For chatscope SCSS theming. | Chatscope ships pre-compiled CSS. Override with plain CSS. No SCSS toolchain needed. |
| Zustand / Jotai / Redux | For chat state management. | React useState + useReducer + context is sufficient for per-project message arrays. Adding a state library for one feature adds unnecessary complexity. |
| prop-types | Listed as chatscope peer dep. | Already bundled with React 18 projects transitively. No explicit install needed in most setups; add only if peer dep warning appears. |
| Markdown renderer for messages | react-markdown is already installed. | Reuse existing `react-markdown` + `remark-gfm` for rendering message content that contains markdown. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Chat UI | @chatscope/chat-ui-kit-react | Build from scratch with Tailwind | Chatscope solves scroll-to-bottom, typing indicators, conversation list layout, and message grouping out of the box. Building these from scratch takes 2-3x longer and introduces subtle scroll bugs. The SCSS/Tailwind coexistence is manageable with the pre-compiled CSS approach. |
| Chat UI | @chatscope/chat-ui-kit-react | stream-chat-react (GetStream) | Commercial SDK requiring their hosted backend. Massive overkill for a local single-user dashboard. |
| Chat UI | @chatscope/chat-ui-kit-react | Custom with shadcn components | shadcn has no chat primitives. You would be building MessageList scroll behavior, ConversationList, typing indicators, and message grouping from scratch using generic Card/List components. Chatscope is purpose-built for this. |
| ANSI stripping | strip-ansi@6.0.1 | Custom regex `\x1b\[[0-9;]*m` | The simple regex misses cursor movement sequences, OSC sequences, and edge cases. strip-ansi handles all ANSI escape types correctly. 10 lines of import vs 50+ lines of incomplete regex. |
| Message store | SQLite (existing) | Redis | Single-user local app. Redis adds infrastructure dependency for zero benefit. SQLite WAL mode handles concurrent reads from the poller + writes from the classifier without contention. |
| Real-time | ws (existing) | Pusher / Ably | Cloud pub-sub services for multi-user apps. This is single-user, single-machine. Raw WebSocket is already working. |

## Installation

```bash
# Client dependencies (chat UI)
cd client && npm install @chatscope/chat-ui-kit-react@^2.1.1 @chatscope/chat-ui-kit-styles@^1.4.0

# Server dependency (ANSI processing)
npm install strip-ansi@6.0.1
```

**Total new dependencies: 3 packages** (2 client, 1 server). Zero new dev dependencies. No native module compilation. No new infrastructure.

## Version Compatibility Matrix

| New Package | React 18 | Vite 6 | Tailwind 3 | Node 18+ | better-sqlite3 |
|-------------|----------|--------|------------|----------|----------------|
| @chatscope/chat-ui-kit-react@2.1.1 | Yes (supports 16-19) | Yes (standard React lib) | Coexists (BEM CSS namespaced) | N/A (client only) | N/A |
| @chatscope/chat-ui-kit-styles@1.4.0 | N/A (CSS only) | Yes (CSS import) | Coexists (no class conflicts) | N/A (client only) | N/A |
| strip-ansi@6.0.1 | N/A (server only) | N/A | N/A | Yes (CJS, no native deps) | N/A |

## Integration Points with Existing Stack

### Client Data Flow

```
useWebSocket (existing)
    |
    v
chat:message / chat:typing / chat:unread (new WS types)
    |
    v
ChatView component (new)
    |
    +---> ConversationList (@chatscope) -- project list with unread badges
    +---> ChatContainer (@chatscope) -- per-project message view
              |
              +---> MessageList (@chatscope) -- scroll, grouping, auto-scroll
              +---> Message (@chatscope) -- standard text messages
              +---> Message.CustomContent -- stage banners, tappable commands, errors
              +---> MessageInput (@chatscope) -- send box (reuses existing send-keys API)
```

- Import chatscope CSS in `client/src/main.tsx` alongside existing Tailwind import
- Chatscope components receive data from React state updated by WebSocket
- Existing `react-router-dom` routes for navigation between chat list and detail
- Existing `react-markdown` for rendering markdown within message content

### Server Data Flow

```
tmux capture-pane (existing, polling)
    |
    v
strip-ansi (new) -- clean text extraction
    |
    v
classifier module (new) -- regex pattern matching
    |
    v
gsd_messages table (existing, extended schema)
    |
    v
WebSocket broadcast (existing) -- chat:message events to client
```

- Classifier runs on existing state detection polling interval
- Reuses `capturePaneText()` from `server/gsd/tmux.js`
- Classified messages persisted via existing `insertGsdMessage` prepared statement (extended)
- WebSocket broadcast uses existing `wss.clients.forEach()` pattern

## Confidence Assessment

| Decision | Confidence | Reason |
|----------|------------|--------|
| @chatscope/chat-ui-kit-react | MEDIUM | 1.7k stars, 16k weekly downloads, React 18 compatible, MIT license. Concern: last release May 2025 (10 months ago), moderately active maintenance. Verified via GitHub repo and npm. Fallback path exists (progressive replacement with custom components). |
| @chatscope/chat-ui-kit-styles | MEDIUM | Required companion to chat-ui-kit-react. Pre-compiled CSS confirmed via GitHub README. Dark mode requires manual CSS overrides (not built-in). |
| strip-ansi@6.0.1 | HIGH | 600M+ weekly downloads, zero dependencies, CJS compatible at v6. Industry standard for ANSI stripping. Verified ESM-only change at v7 via GitHub/npm. |
| No new state management | HIGH | Existing useState + WebSocket pattern is proven in this codebase. Chat state (message array per project, unread count, typing boolean) is simple enough for React built-ins. |
| SQLite schema extension | HIGH | Existing `gsd_messages` table + ALTER TABLE migration. Proven migration pattern already in `server/db.js` (autopilot_runs, model_pricing). |
| No new WebSocket library | HIGH | Existing `ws` server + `useWebSocket` client hook already handles reconnection, message dispatch, broadcasting. Adding message types is additive, not architectural. |
| Custom classifier (no library) | HIGH | Claude Code / GSD output patterns are project-specific. No generic NLP library would handle these better than targeted regex. Existing pattern matching in `tmux.js` proves this approach. |

## Sources

- [chatscope/chat-ui-kit-react GitHub](https://github.com/chatscope/chat-ui-kit-react) -- Component list, peer deps (React 16-19), MIT license, v2.1.1
- [chatscope npm](https://www.npmjs.com/package/@chatscope/chat-ui-kit-react) -- Version 2.1.1, ~16k weekly downloads
- [chatscope Storybook](https://chatscope.io/storybook/react/) -- Component demos and API reference
- [chatscope/chat-ui-kit-styles GitHub](https://github.com/chatscope/chat-ui-kit-styles) -- SCSS source, pre-compiled CSS availability
- [strip-ansi GitHub](https://github.com/chalk/strip-ansi) -- CJS/ESM versioning, v6 is last CJS
- [ansi_up GitHub](https://github.com/drudru/ansi_up) -- Evaluated and rejected (ANSI-to-HTML, not needed for classification)
- [chatscope package.json](https://raw.githubusercontent.com/chatscope/chat-ui-kit-react/master/package.json) -- Verified peer dependencies
