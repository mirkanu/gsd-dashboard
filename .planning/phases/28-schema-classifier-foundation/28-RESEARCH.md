# Phase 28: Schema + Classifier Foundation - Research

**Researched:** 2026-04-03
**Domain:** SQLite schema extension, terminal output classification, chatscope integration
**Confidence:** HIGH

## Summary

Phase 28 lays the data pipeline foundation for the v4.0 chat-first redesign. It has four concrete deliverables: (1) install @chatscope/chat-ui-kit-react and verify it renders without style conflicts, (2) extend the `gsd_messages` table with `message_type` and `metadata` columns, (3) build a tmux output classifier that converts raw terminal text into typed message objects, and (4) ensure tool calls and verbose working output are classified as "hidden" and excluded from chat-visible queries.

The existing codebase provides strong foundations: `capturePaneText()` in `server/gsd/tmux.js` already captures tmux output, `strip-ansi@6.0.1` is already installed, the `gsd_messages` table already stores messages with project/direction/content, and the `broadcast()` function in `server/websocket.js` already pushes events to clients. The existing migration pattern (try-SELECT-catch-ALTER) in `server/db.js` is proven. The classifier should be built as pure functions in a separate module for testability, with the polling/persistence layer as a thin wrapper.

**Primary recommendation:** Extend `gsd_messages` with ALTER TABLE (not a new table) for minimal disruption. Build classifier as pure functions in `server/gsd/classifierPatterns.js`, tested with real tmux output samples. Install chatscope packages in client and verify a minimal render. Exclude hidden types via a WHERE clause in the existing `listGsdMessages` query.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INF-01 | Adopt @chatscope/chat-ui-kit-react for UI components | Install chatscope + styles packages, import CSS in main.tsx, verify minimal component renders. Stack research confirms v2.1.1 compatible with React 18, BEM-namespaced CSS coexists with Tailwind. |
| INF-02 | Extend gsd_messages table schema for typed messages (type, metadata columns) | ALTER TABLE migration following existing db.js pattern. Add `message_type` TEXT and `metadata` TEXT columns. Add index on (project, message_type). |
| MSG-01 | Server-side tmux output classifier that parses terminal text into typed messages | Build `classifierPatterns.js` as pure functions using regex. Reuse existing `timerPatterns` and `waitingPatterns` from tmux.js. strip-ansi@6.0.1 already installed. |
| MSG-07 | Tool calls, code output, and verbose working output hidden completely | Classify tool calls (`Read(`, `Write(`, `Bash(`, `Grep(`, `Glob(`), thinking indicators, and verbose output as `message_type = 'hidden'`. Add WHERE clause `message_type != 'hidden'` to chat-visible queries. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| better-sqlite3 | existing | SQLite persistence for classified messages | Already in use |
| strip-ansi | 6.0.1 | Remove ANSI escape codes from tmux capture-pane output | Already installed (server) |
| ws | existing | WebSocket broadcast for new classified messages | Already in use |

### New Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @chatscope/chat-ui-kit-react | ^2.1.1 | Chat container, message list, message bubbles | Production-tested chat UI primitives, React 16-19 compatible, BEM-namespaced CSS |
| @chatscope/chat-ui-kit-styles | ^1.4.0 | Base CSS theme for chatscope components | Required companion, ships pre-compiled CSS (no SCSS build step) |

### No New Dependencies Needed
| Problem | Solution |
|---------|----------|
| Classifier logic | Custom regex module (`server/gsd/classifierPatterns.js`) -- patterns are project-specific |
| Schema migration | ALTER TABLE via existing db.js try/catch pattern |
| ANSI stripping | strip-ansi@6.0.1 already installed |

**Installation:**
```bash
cd client && npm install @chatscope/chat-ui-kit-react@^2.1.1 @chatscope/chat-ui-kit-styles@^1.4.0
```

## Architecture Patterns

### Recommended Project Structure
```
server/gsd/
  classifierPatterns.js   # Pure functions: classify text -> typed messages (NEW)
  classifier.js           # TmuxClassifier class: poll, diff, persist, broadcast (NEW -- future phase)
  tmux.js                 # capturePaneText(), detectSessionState() (EXISTING, unchanged)

server/
  db.js                   # ALTER TABLE migration + new prepared statements (MODIFIED)

client/src/
  main.tsx                # Import chatscope CSS (MODIFIED)
  lib/types.ts            # ChatMessage type (MODIFIED)
  components/ChatTest.tsx # Minimal chatscope render verification (NEW, temporary)
```

### Pattern 1: Schema Migration (Follow Existing Pattern)
**What:** Add columns to `gsd_messages` using try-SELECT-catch-ALTER, exactly like existing migrations in db.js (lines 132-187, 222-265, 270-295).
**When to use:** Always for schema changes in this project.
**Example:**
```javascript
// Source: server/db.js existing migration pattern (line 132)
try {
  db.prepare("SELECT message_type FROM gsd_messages LIMIT 1").get();
} catch {
  db.prepare("ALTER TABLE gsd_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'").run();
  db.prepare("ALTER TABLE gsd_messages ADD COLUMN metadata TEXT").run();
}
```

### Pattern 2: Classifier as Pure Functions
**What:** Separation of classification logic (pure, testable) from I/O (polling, persistence, broadcast).
**When to use:** For the classifier -- the most complex new code. Pure functions in `classifierPatterns.js`, I/O wrapper in `classifier.js`.
**Example:**
```javascript
// server/gsd/classifierPatterns.js -- pure functions, no side effects
const stripAnsi = require('strip-ansi');

/**
 * Classify a block of raw tmux output into typed message objects.
 * @param {string} rawText - Raw tmux capture-pane output (may contain ANSI)
 * @returns {Array<{msg_type: string, content: string, metadata: object|null}>}
 */
function classifyChunks(rawText) {
  const clean = stripAnsi(rawText);
  const lines = clean.split('\n').filter(l => l.trim());
  const messages = [];
  // ... classification logic ...
  return messages;
}
module.exports = { classifyChunks };
```

### Pattern 3: Chatscope CSS Import (Isolated)
**What:** Import chatscope styles in the Vite entry point, alongside existing Tailwind import.
**When to use:** One-time setup in main.tsx.
**Example:**
```typescript
// client/src/main.tsx
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import "./index.css"; // Tailwind -- loaded AFTER chatscope so Tailwind utilities win
```

### Anti-Patterns to Avoid
- **One message per terminal line:** Group related lines into logical messages. A stage banner is one message. A multi-line error is one message.
- **New table instead of ALTER TABLE:** The architecture research suggested a new `chat_messages` table, but for Phase 28 the simpler path is extending `gsd_messages`. Existing code continues working. New table can come later if needed.
- **Client-side ANSI parsing:** Always strip ANSI server-side before classification.
- **Inline regex in classifier:** Store patterns in a configuration object for testability and maintainability.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI escape stripping | Custom regex `\x1b\[[0-9;]*m` | `strip-ansi@6.0.1` (already installed) | Misses CSI, OSC, ACS sequences. strip-ansi handles all ANSI escape types. |
| Chat message list scroll | Custom scroll-to-bottom logic | chatscope `MessageList` (later phases) | Chatscope handles sticky-bottom, auto-scroll, and scroll anchor correctly |
| SQLite migration framework | Custom migration runner | Existing try/catch ALTER TABLE pattern | Proven in this codebase, zero dependencies |

## Common Pitfalls

### Pitfall 1: ANSI Escape Codes Corrupt Messages
**What goes wrong:** `tmux capture-pane -p` does not fully strip ANSI. Partial escape sequences leak through, appearing as garbled characters in classified messages.
**Why it happens:** Claude Code output includes spinners, colored status lines, progress bars with cursor repositioning.
**How to avoid:** Always run `strip-ansi()` on captured text BEFORE any pattern matching. Test with real tmux output samples containing spinners and colored output.
**Warning signs:** `\x1b` or `\x9b` bytes in stored messages.

### Pitfall 2: Chatscope CSS Conflicts with Tailwind
**What goes wrong:** Chatscope's CSS has high-specificity selectors and some `!important` declarations that can conflict with Tailwind's reset/preflight.
**How to avoid:** Import chatscope CSS BEFORE Tailwind's index.css in main.tsx. This way Tailwind utilities can override chatscope defaults. For Phase 28, only verify a minimal component renders -- do not attempt full theming yet.
**Warning signs:** Wrong fonts, colors, or spacing on chatscope components. Touch scroll broken on mobile.

### Pitfall 3: ALTER TABLE DEFAULT Value Must Be Constant
**What goes wrong:** SQLite's ALTER TABLE ADD COLUMN requires the DEFAULT to be a constant expression, not a function like `strftime()`.
**How to avoid:** Use `DEFAULT 'text'` for `message_type`. Use no default (nullable) for `metadata`. Existing rows get 'text' type automatically.
**Warning signs:** "Cannot add a column with non-constant default" error.

### Pitfall 4: Classifier Regex Fragility
**What goes wrong:** Claude Code output format changes across versions. Tightly coupled regex patterns break silently.
**How to avoid:** Use a layered classification approach: exact matches first, structural patterns second, heuristic fallback third. Accept that some lines will be "unclassified" (type = 'text'). Build comprehensive tests with real captured output.
**Warning signs:** More than 30% of messages classified as 'text' when they should be typed.

### Pitfall 5: Forgetting to Filter Hidden Messages in Existing Queries
**What goes wrong:** After adding message_type, the existing `listGsdMessages` query still returns all messages including hidden ones.
**How to avoid:** Add a new prepared statement `listVisibleGsdMessages` with `WHERE message_type != 'hidden'`. Keep existing `listGsdMessages` unchanged for backward compatibility.

## Code Examples

### Schema Migration
```javascript
// Source: follows pattern from server/db.js lines 132-187
// Add to server/db.js after existing migrations

try {
  db.prepare("SELECT message_type FROM gsd_messages LIMIT 1").get();
} catch {
  db.prepare(
    "ALTER TABLE gsd_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'"
  ).run();
  db.prepare(
    "ALTER TABLE gsd_messages ADD COLUMN metadata TEXT"
  ).run();
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_gsd_messages_type ON gsd_messages(project, message_type)"
  );
}
```

### Updated Prepared Statements
```javascript
// Extended insert with type and metadata
stmts.insertGsdMessage = db.prepare(
  `INSERT INTO gsd_messages (project, direction, content, message_type, metadata)
   VALUES (?, ?, ?, ?, ?)`
);

// Chat-visible messages (excludes hidden)
stmts.listVisibleGsdMessages = db.prepare(
  `SELECT id, project, direction, content, message_type, metadata, created_at
   FROM gsd_messages
   WHERE project = ? AND message_type != 'hidden'
   ORDER BY created_at DESC LIMIT ? OFFSET ?`
);
```

### Classification Types
```javascript
// server/gsd/classifierPatterns.js
const MESSAGE_TYPES = {
  STAGE_BANNER: 'stage_banner',
  CHECKPOINT: 'checkpoint',
  COMPLETION: 'completion',
  ERROR: 'error',
  HIDDEN: 'hidden',      // tool calls, code output, verbose working
  TEXT: 'text',           // default fallback
};

// Priority-ordered patterns (first match wins)
const PATTERNS = [
  // Hidden: tool calls (highest priority -- filter these out)
  { type: 'hidden', patterns: [
    /^(?:Read|Write|Edit|Bash|Grep|Glob|WebSearch|WebFetch|TodoWrite)\(/,
    /^(?:mcp__|antml_)/,
    /^\s*\d+\s*\|/,          // numbered code output lines
  ]},
  // Stage banners
  { type: 'stage_banner', patterns: [
    /^#{1,3}\s+Phase\s+\d+/i,
    /^(?:PLAN|EXECUTE|RESEARCH|VERIFY):/i,
    /^={3,}\s+/,              // === separators
  ]},
  // Errors
  { type: 'error', patterns: [
    /^(?:Error|ERROR|FAILED|TypeError|SyntaxError|ReferenceError):/,
    /npm ERR!/,
    /ENOENT|EACCES|ECONNREFUSED/,
  ]},
  // Completions
  { type: 'completion', patterns: [
    /PHASE COMPLETE/i,
    /All (?:plans|tasks) (?:executed|finished|complete)/i,
    /SUMMARY\.md written/i,
  ]},
  // Checkpoints
  { type: 'checkpoint', patterns: [
    /YOUR ACTION:/i,
    /Checkpoint:/i,
    /VERIFY:/i,
  ]},
  // Working/thinking (hidden from chat)
  { type: 'hidden', patterns: [
    /\(\s*\d+[ms]+\s*\xB7\s*\u2193/,   // timer patterns (reuse from tmux.js)
    /\xB7\s*\u2193\s*[\d.]+/,
    /\(\s*thinking\s*\)/,
    /^\s*Reading\s+/,
    /^\s*Writing\s+/,
    /^\s*Searching\s+/,
  ]},
];
```

### Minimal Chatscope Verification Component
```tsx
// client/src/components/ChatTest.tsx (temporary verification)
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
} from "@chatscope/chat-ui-kit-react";

export function ChatTest() {
  return (
    <div style={{ height: "300px" }}>
      <MainContainer>
        <ChatContainer>
          <MessageList>
            <Message
              model={{
                message: "Hello from chatscope!",
                sentTime: "just now",
                sender: "System",
                direction: "incoming",
                position: "single",
              }}
            />
          </MessageList>
          <MessageInput placeholder="Type here..." />
        </ChatContainer>
      </MainContainer>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gsd_messages` stores only content | Extended with `message_type` + `metadata` | Phase 28 (now) | Enables typed message rendering |
| Raw terminal output to client | Server-side classification before storage | Phase 28 (now) | Clean typed messages instead of ANSI noise |
| No chat UI library | @chatscope/chat-ui-kit-react installed | Phase 28 (now) | Provides scroll, grouping, bubbles for later phases |

## Open Questions

1. **Grouping strategy for multi-line output**
   - What we know: Consecutive lines of same type within a time window should be grouped into one message.
   - What's unclear: Exact time window and line-count thresholds for grouping.
   - Recommendation: Start with simple per-line classification in Phase 28. Add grouping logic in Phase 30 when building the chat window that consumes these messages.

2. **insertGsdMessage backward compatibility**
   - What we know: The existing `insertGsdMessage` prepared statement is used in 4 places (gsd.js, terminal.js, telegram.js x2). Changing its signature (adding parameters) would break all callers.
   - What's unclear: Whether to update all callers now or add a new statement.
   - Recommendation: Add a NEW statement `insertClassifiedMessage` with type/metadata params. Update `insertGsdMessage` to pass default 'text' type. Existing callers continue working unchanged.

3. **Whether to extend gsd_messages or create chat_messages**
   - What we know: Architecture research suggested a new `chat_messages` table. But Phase 28 success criteria specifically say "the gsd_messages table has type and metadata columns."
   - What's unclear: Whether the new table approach is needed for later phases.
   - Recommendation: Follow success criteria -- extend `gsd_messages` now. If a separate table is needed later, migrate then.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (node:test) |
| Config file | None (uses node --test glob) |
| Quick run command | `node --test server/__tests__/classifier.test.js` |
| Full suite command | `npm run test:server` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INF-01 | Chatscope renders minimal component without style conflicts | manual | Visual check in browser | N/A (manual) |
| INF-02 | gsd_messages has type and metadata columns, classified message persists correctly | unit | `node --test server/__tests__/classifier.test.js -x` | Wave 0 |
| MSG-01 | Classifier receives raw text and returns typed message objects | unit | `node --test server/__tests__/classifier.test.js -x` | Wave 0 |
| MSG-07 | Tool calls and working output classified as hidden, excluded from visible queries | unit | `node --test server/__tests__/classifier.test.js -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test server/__tests__/classifier.test.js`
- **Per wave merge:** `npm run test:server`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/classifier.test.js` -- covers INF-02, MSG-01, MSG-07 (pure function tests with sample tmux output)
- [ ] `server/__tests__/fixtures/tmux-samples.js` -- real captured tmux output for test data

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `server/db.js` (schema, migrations, prepared statements), `server/gsd/tmux.js` (capturePaneText, detectSessionState, patterns), `server/websocket.js` (broadcast), `server/routes/gsd.js` (insertGsdMessage usage), `client/src/lib/types.ts` (GsdMessage type)
- strip-ansi@6.0.1 confirmed installed via `node -e "require('strip-ansi')"`
- Existing test framework: `node --test` with tests in `server/__tests__/*.test.js`

### Secondary (MEDIUM confidence)
- [@chatscope/chat-ui-kit-react npm](https://www.npmjs.com/package/@chatscope/chat-ui-kit-react) -- Version 2.1.1, React 16-19 compatible
- [@chatscope/chat-ui-kit-styles npm](https://www.npmjs.com/package/@chatscope/chat-ui-kit-styles) -- Pre-compiled CSS confirmed
- [chatscope Storybook](https://chatscope.io/storybook/react/) -- Component API reference
- [chatscope GitHub](https://github.com/chatscope/chat-ui-kit-react) -- BEM class naming, peer deps

### Tertiary (LOW confidence)
- [chatscope issue #143](https://github.com/chatscope/chat-ui-kit-react/issues/143) -- No official Tailwind integration (from pitfalls research)
- [chatscope issue #159](https://github.com/chatscope/chat-ui-kit-react/issues/159) -- Mobile scroll touch-action issue

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - strip-ansi already installed, chatscope verified on npm, SQLite migration pattern proven in codebase
- Architecture: HIGH - extends existing patterns (db.js migrations, tmux.js patterns, prepared statements)
- Pitfalls: HIGH - ANSI corruption and CSS conflicts well-documented in prior research; classifier fragility mitigated by pure-function design + tests

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable domain, no fast-moving dependencies)
