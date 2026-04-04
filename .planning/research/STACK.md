# Technology Stack: v4.1 Chat Polish

**Project:** GSD Dashboard - Classifier Accuracy + Feedback UI
**Researched:** 2026-04-04
**Scope:** Additions for v4.1 only. Existing validated stack (React 18, Vite 6, Express, SQLite/better-sqlite3, ws, @chatscope/chat-ui-kit-react, Tailwind CSS 3, strip-ansi, lucide-react) is NOT re-evaluated.

## Recommended Stack Additions

### Context Menu (Client)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @radix-ui/react-context-menu | ^2.2.x | Right-click / long-press menu on chat messages | Unstyled accessible primitive. Handles right-click on desktop AND long-press on touch devices natively -- no separate long-press hook needed. Keyboard navigation, focus management, collision-aware positioning all built in. Pairs naturally with Tailwind (zero default styles to fight). Used by shadcn/ui. 60k+ GitHub stars on Radix monorepo. |

**Why Radix over alternatives:**

| Considered | Verdict | Why Not |
|------------|---------|---------|
| @radix-ui/react-context-menu | **CHOSEN** | Unstyled, long-press built-in, Tailwind-native, accessible, proven |
| react-contexify | Rejected | Ships its own CSS theme; fighting styles adds overhead in a Tailwind project |
| Custom onContextMenu + useRef | Rejected | Requires manual long-press detection, positioning, focus trap, portal, collision avoidance -- 200+ lines to reimplement what Radix provides |
| Base UI Context Menu | Considered | Similar approach to Radix but smaller ecosystem; Radix has more community examples |
| shadcn/ui ContextMenu | N/A | shadcn is not installed in this project (no copy-paste component setup). Using the underlying Radix primitive directly is cleaner here. |

**Integration with chatscope:** Wrap each `<ChatMessageRenderer>` output in `<ContextMenu.Trigger>`. The Radix trigger is a transparent wrapper -- it renders its child directly and attaches event handlers. No layout disruption to existing message bubbles.

**Sub-components used:**

```tsx
import * as ContextMenu from '@radix-ui/react-context-menu';

// Per message:
<ContextMenu.Root>
  <ContextMenu.Trigger asChild>
    <div>{/* existing message bubble */}</div>
  </ContextMenu.Trigger>
  <ContextMenu.Portal>
    <ContextMenu.Content className="bg-surface-2 rounded-lg shadow-lg p-1 min-w-[160px]">
      <ContextMenu.Item className="px-3 py-2 text-sm cursor-pointer hover:bg-surface-3 rounded">
        Flag as wrong type
      </ContextMenu.Item>
      <ContextMenu.Item>Should be hidden</ContextMenu.Item>
      <ContextMenu.Item>Copy text</ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
```

**Confidence:** HIGH -- Radix primitives are the de facto standard for accessible unstyled React components. Long-press support verified in official docs.

### No Additional Server Dependencies

The v4.1 server-side features (feedback storage, dynamic pattern management, improved classification) require **zero new npm packages**. Everything is built on existing stack:

| Need | Solution | Existing Dependency |
|------|----------|-------------------|
| Feedback storage | New SQLite table + prepared statements | better-sqlite3 (already installed) |
| Dynamic regex patterns | Store in SQLite, compile with `new RegExp()` at runtime | Node.js built-in RegExp |
| Pattern hot-reload | File-watch or API-triggered cache invalidation | Node.js built-in |
| ANSI stripping | Already used throughout | strip-ansi ^6.0.1 |
| Improved tmux capture | `-J` flag on existing `capture-pane` call | tmux CLI (system) |

**Confidence:** HIGH -- all server needs are covered by existing dependencies and Node.js built-ins.

## Stack Addition Detail

### @radix-ui/react-context-menu

**What it provides:**
- `ContextMenu.Root` / `Trigger` / `Content` / `Item` -- composable primitives
- Right-click on desktop, long-press (~700ms) on touch devices
- Portal rendering (menu escapes overflow:hidden containers)
- Collision-aware positioning (flips when near viewport edge)
- Full keyboard navigation (arrow keys, typeahead, Escape to close)
- WAI-ARIA compliant menu role

**Peer dependencies:** React 16.8+, ReactDOM 16.8+ (satisfied by React 18.3.1)

**Bundle impact:** ~8KB minified+gzipped (context-menu primitive + internal deps). Tree-shakeable.

**Dark mode:** Styled entirely via Tailwind classes on `Content` and `Item` -- inherits the project's existing dark-mode-by-default approach with no extra work.

## Runtime Pattern Architecture (No New Dependencies)

The classifier currently uses hardcoded `PATTERNS` array in `classifierPatterns.js`. For v4.1, patterns move to SQLite with an in-memory cache:

**Storage:** New `classifier_patterns` table in SQLite:
```sql
CREATE TABLE classifier_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL,        -- e.g. 'hidden_tool_calls'
  pattern TEXT NOT NULL,           -- regex source string
  flags TEXT NOT NULL DEFAULT '',  -- regex flags (e.g. 'i')
  msg_type TEXT NOT NULL,          -- target MESSAGE_TYPE
  priority INTEGER NOT NULL,       -- lower = matched first
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

**Runtime compilation:** On server start (and after any pattern CRUD), load all enabled patterns ordered by priority, compile each with `new RegExp(pattern, flags)`, cache the compiled array in memory. Classification hot path uses the cached compiled regexps -- zero SQLite queries per message.

**Reload trigger:** After any pattern insert/update/delete via API, bump a version counter and recompile. No file-watching needed; the API endpoint that mutates patterns also invalidates the cache.

**Seeding:** On first run, if the table is empty, seed it from the current hardcoded PATTERNS array. This preserves backward compatibility and provides a known-good baseline.

**Confidence:** HIGH -- `new RegExp()` from stored strings is a well-established Node.js pattern. The only risk is malformed regex from user input; mitigate by validating with try/catch on `new RegExp()` before INSERT.

## Improved tmux Capture (No New Dependencies)

Current `capturePaneText` uses:
```js
execFileSync('tmux', ['capture-pane', '-p', '-t', sessionName])
```

v4.1 improvement -- add `-J` flag to join wrapped lines:
```js
execFileSync('tmux', ['capture-pane', '-p', '-J', '-t', sessionName])
```

The `-J` flag tells tmux to reconstruct lines that were soft-wrapped at the terminal width. Without it, a single long line from Claude (e.g., a paragraph of explanation) gets split into multiple 80-char fragments, each classified independently -- causing duplicate text messages and broken context. With `-J`, the classifier receives logical lines that match what the user sees.

**Risk:** `-J` is available in tmux 2.4+ (2017). The Railway deployment and local machine both run modern tmux. No compatibility concern.

**Confidence:** HIGH -- verified in tmux man page documentation.

## Installation

```bash
# Client addition (from client/ directory)
npm install @radix-ui/react-context-menu

# No server additions needed
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Context menu | @radix-ui/react-context-menu | react-contexify | Ships opinionated CSS; Radix is unstyled + Tailwind-native |
| Context menu | @radix-ui/react-context-menu | Custom implementation | Too much boilerplate for positioning, portals, a11y, touch |
| Long-press | Radix built-in | use-long-press npm | Radix context menu already handles long-press; extra dep is redundant |
| Pattern storage | SQLite table | JSON config file | DB allows API-driven CRUD, feedback-to-pattern pipeline, audit trail |
| Pattern storage | SQLite table | Redis/external DB | Overkill for single-user tool; SQLite already in stack |
| Regex engine | Node.js RegExp | RE2 / sqlite-regex | Standard regexps are sufficient; patterns are simple; no ReDoS risk with short input lines |

## Sources

- [Radix Context Menu Documentation](https://www.radix-ui.com/primitives/docs/components/context-menu) -- HIGH confidence, official docs
- [@radix-ui/react-context-menu on npm](https://www.npmjs.com/package/@radix-ui/react-context-menu) -- HIGH confidence
- [tmux man page (capture-pane -J flag)](https://man7.org/linux/man-pages/man1/tmux.1.html) -- HIGH confidence, official docs
- [use-long-press on npm](https://www.npmjs.com/package/use-long-press) -- evaluated but not needed
- [react-contexify on GitHub](https://github.com/fkhadra/react-contexify) -- evaluated but not chosen
