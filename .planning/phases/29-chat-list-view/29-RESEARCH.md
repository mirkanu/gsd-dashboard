# Phase 29: Chat List View - Research

**Researched:** 2026-04-03
**Domain:** Chat-style conversation list UI replacing kanban board, using @chatscope/chat-ui-kit-react + Tailwind CSS
**Confidence:** HIGH

## Summary

Phase 29 replaces the kanban board layout in GSD.tsx with a WhatsApp/Telegram-style conversation list. Each project appears as a chat row showing project name, last message preview, relative timestamp, unread count badge, and a colored left border indicating session state. Filter tabs above the list allow filtering by state (All, Waiting, Working, Paused, Archived) with counts per tab.

The chatscope library is already installed (Phase 28-01) with CSS imported before Tailwind in `main.tsx`. The key challenge is theming: chatscope uses hardcoded colors (`#fff`, `#d1dbe3`, `rgba(0,0,0,.87)`) rather than CSS custom properties, so dark mode requires explicit CSS overrides targeting `.cs-*` selectors scoped under `:root:not(.light)` (dark is default) and `:root.light`. The `Conversation` and `ConversationList` components from chatscope provide the list layout with props for `name`, `info`, `lastActivityTime`, `unreadCnt`, and `unreadDot`, but the left border state coloring must be applied via CSS overrides on the wrapping elements.

**Primary recommendation:** Build the chat list as a new `ChatListView` component that replaces the kanban rendering in GSD.tsx. Use chatscope's `ConversationList` and `Conversation` components for list structure but wrap each `Conversation` in a container div that applies the state-colored left border. Write a dedicated `chatscope-theme.css` file imported after chatscope's CSS but before Tailwind, mapping chatscope's hardcoded colors to the project's existing CSS variable system for both light and dark themes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-01 | Projects displayed as chat rows sorted by most recent activity | Use `sessionUpdatedAt` from existing `/api/gsd/projects` response + last message timestamp for sort. `Conversation` component renders each row. |
| CHAT-02 | Each row shows project name, last message preview, timestamp, unread count | `Conversation` props: `name`, `info` (last message preview), `lastActivityTime`, `unreadCnt`. Last message fetched from existing `/api/gsd/projects/:name/messages?limit=1`. |
| CHAT-03 | State-colored left border (yellow=waiting, green=working, red=paused, grey=archived) | Wrap each `Conversation` in a div with `border-l-4` using existing `SESSION_STATE_CONFIG` color mapping from GSD.tsx. |
| CHAT-04 | Filter tabs (All, Waiting, Working, Paused, Archived) with counts | Build custom tab bar above `ConversationList`. Reuse filter logic from existing GSD.filter.test.ts. Each tab shows `projects.filter(p => p.sessionState === state).length`. |
| CHAT-05 | Tapping a chat row opens the per-project chat window | For Phase 29, tapping navigates to a placeholder (Phase 30 builds the actual chat window). Use state-driven view switching `{ view: 'list' | 'chat', project?: string }` within GSD route. |
| INF-04 | Light/dark theme support for chatscope components | Create `chatscope-theme.css` with overrides for `.cs-conversation-list`, `.cs-conversation`, `.cs-avatar` backgrounds, borders, and text colors. Scope overrides to `:root.light` and default dark theme. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @chatscope/chat-ui-kit-react | ^2.1.1 | `ConversationList`, `Conversation`, `Avatar` components | Installed in Phase 28-01. Provides list layout with unread badges, activity times, scroll support. |
| @chatscope/chat-ui-kit-styles | ^1.4.0 | Base CSS for chatscope components | Installed in Phase 28-01. CSS imported in `main.tsx` before Tailwind. |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-router-dom | existing | URL routing (GSD page at `/gsd`) | Route stays the same; view switching via React state, not URL |
| lucide-react | existing | Filter tab icons, refresh icon | Tab indicators, empty state illustrations |
| Tailwind CSS | 3.x | All custom styling outside chatscope components | Filter tabs, wrappers, spacing, border colors |

### No New Dependencies
This phase requires zero new npm packages. Everything builds on Phase 28 installations and existing project stack.

## Architecture Patterns

### Recommended Project Structure
```
client/src/
  pages/
    GSD.tsx                    # MODIFIED: conditionally renders ChatListView or kanban
  components/
    ChatListView.tsx           # NEW: main chat list component
    ChatListFilters.tsx        # NEW: filter tabs bar component
  styles/
    chatscope-theme.css        # NEW: dark/light overrides for chatscope
  lib/
    api.ts                     # MODIFIED: add chat-summary or last-message endpoint
    types.ts                   # MODIFIED: add ChatListProject type if needed
```

### Pattern 1: State-Driven View Switching (Not URL)
**What:** GSD.tsx uses React state `{ view: 'list' | 'chat', project?: string }` to toggle between ChatListView and future ChatWindow.
**When to use:** Now. Keeps `/gsd` as the single route. Mobile-app-like feel.
**Example:**
```typescript
// In GSD.tsx
const [chatView, setChatView] = useState<{ view: 'list' | 'chat'; project?: string }>({ view: 'list' });

// Render
{chatView.view === 'list' ? (
  <ChatListView projects={projects} onSelectProject={(name) => setChatView({ view: 'chat', project: name })} />
) : (
  // Phase 30 placeholder
  <div>Chat view for {chatView.project} - coming in Phase 30</div>
)}
```

### Pattern 2: Chatscope Conversation with Custom Wrapper
**What:** Wrap each `Conversation` component in a styled div for state-colored borders.
**When to use:** For every project row in the list.
**Example:**
```tsx
import { Conversation, ConversationList, Avatar } from "@chatscope/chat-ui-kit-react";

const STATE_BORDER: Record<SessionState, string> = {
  working:  "border-l-emerald-500",
  waiting:  "border-l-amber-400",
  paused:   "border-l-red-500",
  archived: "border-l-gray-600",
};

function ChatListView({ projects, onSelectProject }: Props) {
  const sorted = [...projects].sort((a, b) => {
    const aTime = a.sessionUpdatedAt || '1970';
    const bTime = b.sessionUpdatedAt || '1970';
    return bTime.localeCompare(aTime);  // newest first
  });

  return (
    <ConversationList>
      {sorted.map(p => (
        <div key={p.name} className={`border-l-4 ${STATE_BORDER[p.sessionState]}`}>
          <Conversation
            name={p.display_name || p.name}
            info={p.lastMessagePreview || "No messages yet"}
            lastActivityTime={timeAgo(p.sessionUpdatedAt)}
            unreadCnt={p.unreadCount || 0}
            onClick={() => onSelectProject(p.name)}
          >
            <Avatar name={p.name} />
          </Conversation>
        </div>
      ))}
    </ConversationList>
  );
}
```

### Pattern 3: Filter Tabs with Count Badges
**What:** Custom tab bar above conversation list with All/Waiting/Working/Paused/Archived tabs, each showing a count.
**When to use:** Always visible above the list.
**Example:**
```tsx
const FILTERS: { label: string; state: SessionState | null }[] = [
  { label: "All", state: null },
  { label: "Waiting", state: "waiting" },
  { label: "Working", state: "working" },
  { label: "Paused", state: "paused" },
  { label: "Archived", state: "archived" },
];

function ChatListFilters({ projects, activeFilter, onFilterChange }: Props) {
  return (
    <div className="flex gap-1 px-3 py-2 overflow-x-auto">
      {FILTERS.map(f => {
        const count = f.state === null
          ? projects.filter(p => p.sessionState !== 'archived').length
          : projects.filter(p => p.sessionState === f.state).length;
        const active = activeFilter === f.state;
        return (
          <button key={f.label} onClick={() => onFilterChange(f.state)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${active ? 'bg-accent/20 text-accent' : 'bg-surface-3 text-gray-400 hover:text-gray-200'}`}>
            {f.label}
            <span className={`text-[10px] px-1.5 rounded-full ${active ? 'bg-accent/30' : 'bg-surface-4'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

### Pattern 4: Relative Timestamp Utility
**What:** Simple `timeAgo()` function for "2m ago", "3h ago", "Yesterday" display.
**When to use:** For `lastActivityTime` prop on each Conversation.
**Example:**
```typescript
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffS = Math.floor((now - then) / 1000);
  if (diffS < 60) return 'just now';
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h`;
  if (diffS < 172800) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
```

### Anti-Patterns to Avoid
- **Using chatscope MainContainer/Sidebar for page layout:** Too opinionated, fights Tailwind layout. Use `ConversationList` directly inside a Tailwind flex container.
- **Fetching messages per-project in the list view:** N+1 query problem. Instead, extend the `/api/gsd/projects` endpoint to include `lastMessagePreview` and `unreadCount` inline, or add a lightweight `/api/gsd/chat-summary` endpoint.
- **Overriding chatscope with `!important` everywhere:** Use CSS specificity (`:root .cs-conversation`) instead of `!important`. If specificity battles get bad, consider rendering custom Tailwind components instead of chatscope's `Conversation`.
- **Adding URL-based routing for list vs chat view:** Keep it state-driven on `/gsd`. URL routing adds back-button complexity and unnecessary route transitions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conversation list scroll | Custom scroll container | chatscope `ConversationList` | Handles scroll restoration, loading states, and `onYReachEnd` for pagination |
| Unread count badge | Custom positioned badge | chatscope `Conversation` `unreadCnt` prop | Pre-styled badge positioning built into the component |
| Relative timestamps | date-fns or dayjs | 15-line `timeAgo()` utility | Project convention: avoid date libraries (STACK.md "What NOT to Add") |
| Chat row layout | Custom flex/grid layout | chatscope `Conversation` component | Handles name, info, avatar, timestamp, unread in pre-tested layout |

## Common Pitfalls

### Pitfall 1: Chatscope CSS Overrides Break Dark Theme
**What goes wrong:** Chatscope hardcodes `background-color: #fff`, `color: rgba(0,0,0,.87)`, `border: solid 1px #d1dbe3` directly in its selectors. The dark dashboard shows white conversation rows.
**Why it happens:** Chatscope has no CSS variable system and no built-in dark mode.
**How to avoid:** Create `chatscope-theme.css` with targeted overrides. Import it after chatscope CSS but before Tailwind. Key selectors to override:
```css
/* Dark theme (default) */
.cs-conversation-list { background-color: var(--surface-1); border-color: var(--border); }
.cs-conversation { background-color: var(--surface-2); color: inherit; }
.cs-conversation:hover { background-color: var(--surface-3); }
.cs-conversation--active { background-color: var(--surface-3); }
.cs-conversation__content { color: inherit; }
.cs-conversation__name { color: inherit; }
.cs-conversation__info { color: var(--surface-5); }  /* muted preview text */
.cs-conversation__last-activity-time { color: var(--surface-5); }
.cs-conversation__unread-dot { background-color: var(--accent, #6366f1); }

/* Light theme */
:root.light .cs-conversation-list { background-color: var(--surface-1); border-color: var(--border); }
:root.light .cs-conversation { background-color: var(--surface-0); }
:root.light .cs-conversation:hover { background-color: var(--surface-2); }
```
**Warning signs:** White boxes in dark mode, invisible text in light mode.

### Pitfall 2: N+1 Query for Last Message Preview
**What goes wrong:** ChatListView fetches `/api/gsd/projects/:name/messages?limit=1` for every project to get last message preview. With 6 projects, that is 7 API calls on page load.
**Why it happens:** The existing `/api/gsd/projects` endpoint does not include message data.
**How to avoid:** Extend the existing projects endpoint OR add a single `/api/gsd/chat-summary` endpoint that returns all projects with their last message in one query. The server already has `listGsdMessages` and `countGsdMessages` prepared statements. A single SQL query with a window function or subquery can return last message per project:
```sql
SELECT project, content, message_type, created_at
FROM gsd_messages m1
WHERE m1.id = (
  SELECT MAX(m2.id) FROM gsd_messages m2
  WHERE m2.project = m1.project AND m2.message_type != 'hidden'
)
```
**Warning signs:** Slow initial page load, visible loading states on each row.

### Pitfall 3: Conversation Border-Left Override Conflict
**What goes wrong:** Chatscope's `.cs-conversation` may have its own border-left styling or padding that conflicts with the state-colored `border-l-4` applied via a wrapper div.
**Why it happens:** The wrapper div border is outside chatscope's component boundary; chatscope may set its own borders internally.
**How to avoid:** Apply the border directly to `.cs-conversation` using a data attribute or inline style rather than a wrapper div. Or use the wrapper approach but ensure chatscope's own left border is removed:
```css
.cs-conversation { border-left: none !important; }
```
Then the wrapper div's `border-l-4 border-l-emerald-500` will be visible.
**Warning signs:** Double borders, border not visible, inconsistent padding.

### Pitfall 4: Mobile Touch Scrolling Broken
**What goes wrong:** Chatscope sets `touch-action: none` on scroll wrappers (known issue #159), breaking mobile scroll.
**Why it happens:** Library default for gesture handling conflicts with mobile browser behavior.
**How to avoid:** Add CSS override: `.cs-conversation-list__scroll-wrapper { touch-action: auto !important; }`. This is a known fix from the chatscope issues.
**Warning signs:** Cannot scroll the conversation list on mobile (Railway URL on phone).

### Pitfall 5: Sort Order Incorrect for Projects Without Messages
**What goes wrong:** Projects with no messages (newly added) sort to the bottom even though they may have recent tmux activity.
**Why it happens:** Sorting purely by last message timestamp excludes projects that have never had messages classified.
**How to avoid:** Use `sessionUpdatedAt` as the sort key (from the sessions table), not last message time. This reflects tmux/Claude activity even without classified messages. For Phase 29, this is the correct sort key since the classifier pipeline (Phase 28-03/04) is not yet wired to persist messages.

## Code Examples

### Chatscope Import Pattern (Verified from Phase 28-01)
```typescript
// Already in main.tsx line 4:
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";

// Component imports:
import {
  ConversationList,
  Conversation,
  Avatar,
} from "@chatscope/chat-ui-kit-react";
```

### SESSION_STATE_CONFIG (From GSD.tsx line 34)
```typescript
// Existing in GSD.tsx -- extract to shared location for reuse
const SESSION_STATE_CONFIG: Record<SessionState, { border: string; label: string; labelCls: string }> = {
  working:  { border: "border-l-4 border-l-emerald-500",  label: "Working",  labelCls: "text-emerald-400" },
  waiting:  { border: "border-l-4 border-l-amber-400",    label: "Waiting",  labelCls: "text-amber-400"   },
  paused:   { border: "border-l-4 border-l-red-500",      label: "Paused",   labelCls: "text-red-400"     },
  archived: { border: "border-l-4 border-l-gray-600",     label: "Archived", labelCls: "text-gray-500"    },
};
```

### Existing API Pattern for Projects
```typescript
// client/src/lib/api.ts line 119
gsd: {
  projects: () => request<{ projects: GsdProject[]; rateLimit: {...} }>("/gsd/projects"),
}
```

### Existing Filter Logic (From GSD.filter.test.ts)
```typescript
function filterProjects(projects: GsdProject[], activeFilter: SessionState | null): GsdProject[] {
  if (activeFilter === null) {
    return projects.filter((p) => p.sessionState !== "archived");
  }
  return projects.filter((p) => p.sessionState === activeFilter);
}
```

### Chatscope Conversation Props (From TypeScript Definitions)
```typescript
interface ConversationProps {
  name?: ReactNode;           // Project display name
  unreadCnt?: number;         // Unread badge count
  unreadDot?: boolean;        // Show dot instead of count
  lastSenderName?: ReactNode; // "Claude" or "You"
  info?: ReactNode;           // Last message preview text
  lastActivityTime?: ReactNode; // Relative timestamp
  active?: boolean;           // Highlighted row
}
```

## State of the Art

| Old Approach (Kanban) | New Approach (Chat List) | Phase | Impact |
|----------------------|--------------------------|-------|--------|
| 4-column kanban board grouped by state | Single sorted list with filter tabs | 29 | Primary navigation model changes from spatial to temporal |
| Project cards with full detail | Compact rows with last message preview | 29 | Faster scanning, less screen real estate per project |
| Click card to expand drawer | Tap row to open chat window | 29 (tap), 30 (window) | Natural mobile interaction pattern |
| Columns sorted alphabetically | List sorted by most recent activity | 29 | Most important projects bubble to top automatically |

## Open Questions

1. **Last message data source for Phase 29**
   - What we know: The existing `/api/gsd/projects` endpoint does not include last message data. The classifier pipeline (Phase 28-03/04) is not yet integrated to persist classified messages automatically.
   - What's unclear: Whether to add a new endpoint or extend the existing one.
   - Recommendation: Extend `/api/gsd/projects` response to include `lastMessage` (content + timestamp) per project from `gsd_messages` table. This is a small server-side addition (one SQL subquery) and avoids N+1 client calls. Existing messages from manual sends provide data even without the classifier.

2. **CHAT-05 navigation target**
   - What we know: Phase 30 builds the actual ChatWindow. Phase 29 needs tapping a row to do something.
   - What's unclear: Should Phase 29 open the existing GsdDrawer or set up a placeholder?
   - Recommendation: Set up the state-driven view switching (`view: 'list' | 'chat'`) and render a minimal placeholder for the chat view. This establishes the navigation pattern without depending on Phase 30. The placeholder can show the project name and a "Chat coming soon" message, or simply open the existing GsdDrawer as a bridge.

3. **Unread count tracking for Phase 29**
   - What we know: `Conversation` component supports `unreadCnt` prop. The `chat_read_cursors` table from the architecture research has not been created yet.
   - What's unclear: Whether to implement unread tracking in Phase 29 or defer to Phase 31.
   - Recommendation: For Phase 29, show `unreadCnt={0}` as a static value. Unread tracking requires the classifier pipeline to be running (Phase 28-03/04) and read cursors (Phase 31). The UI structure supports it but the data pipeline is not ready yet.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (via vite) |
| Config file | `client/vitest.config.ts` |
| Quick run command | `cd /data/home/gsddashboard/client && npx vitest run --reporter=verbose` |
| Full suite command | `npm run test:client` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | Projects sorted by most recent activity | unit | `cd client && npx vitest run src/components/__tests__/ChatListView.test.ts -t "sorts"` | No - Wave 0 |
| CHAT-02 | Row displays name, preview, timestamp, unread | unit | `cd client && npx vitest run src/components/__tests__/ChatListView.test.ts -t "row display"` | No - Wave 0 |
| CHAT-03 | State-colored left border per session state | unit | `cd client && npx vitest run src/components/__tests__/ChatListView.test.ts -t "border"` | No - Wave 0 |
| CHAT-04 | Filter tabs with counts | unit | `cd client && npx vitest run src/components/__tests__/ChatListFilters.test.ts` | No - Wave 0 |
| CHAT-05 | Tap row triggers project selection | unit | `cd client && npx vitest run src/components/__tests__/ChatListView.test.ts -t "select"` | No - Wave 0 |
| INF-04 | Dark/light theme CSS overrides | manual-only | Visual inspection in both themes | N/A |

### Sampling Rate
- **Per task commit:** `cd /data/home/gsddashboard/client && npx vitest run --reporter=verbose`
- **Per wave merge:** `npm run test:client && npm run test:server`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `client/src/components/__tests__/ChatListView.test.ts` -- covers CHAT-01, CHAT-02, CHAT-03, CHAT-05
- [ ] `client/src/components/__tests__/ChatListFilters.test.ts` -- covers CHAT-04
- [ ] `client/src/lib/__tests__/timeAgo.test.ts` -- covers relative timestamp utility

## Sources

### Primary (HIGH confidence)
- Codebase: `client/src/pages/GSD.tsx` -- existing kanban board, SESSION_STATE_CONFIG, filter logic
- Codebase: `client/src/lib/types.ts` -- GsdProject, SessionState, GsdMessage types
- Codebase: `client/src/main.tsx` -- chatscope CSS import order (line 4)
- Codebase: `client/src/lib/api.ts` -- existing gsd.projects() and gsd.messages() endpoints
- Codebase: `client/src/components/GsdDrawer.tsx` -- existing MessageLog component pattern
- Codebase: `client/src/lib/eventBus.ts` -- WebSocket event subscription pattern
- Codebase: `server/routes/gsd.js` -- projects endpoint, messages endpoint, GSD_DATA_URL proxy pattern
- Codebase: `server/db.js` -- listGsdMessages, listVisibleGsdMessages, countGsdMessages prepared statements
- Chatscope TypeScript definitions: `Conversation.d.ts`, `ConversationList.d.ts` -- component prop interfaces
- Chatscope CSS: `styles.min.css` -- hardcoded color values, `.cs-conversation` selectors
- Phase 28-01 SUMMARY: chatscope installed, CSS import verified, no style conflicts confirmed
- Phase 28-02 SUMMARY: classifier pure functions ready

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` -- chatscope Tailwind coexistence strategy, dark mode override approach
- `.planning/research/PITFALLS.md` -- Pitfall #2 (CSS conflicts), #11 (dark mode mismatch)
- `.planning/research/ARCHITECTURE.md` -- client-side architecture, component boundaries
- `.planning/research/FEATURES.md` -- chat list feature specifications, filter tabs design

### Tertiary (LOW confidence)
- Chatscope GitHub issues #143 (no Tailwind integration), #159 (mobile touch broken) -- referenced in pitfalls research but not re-verified today

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in Phase 28
- Architecture: HIGH -- direct codebase analysis of all integration points, types, and API endpoints
- Pitfalls: HIGH -- CSS analysis of actual chatscope stylesheet confirms hardcoded colors; mobile scroll issue documented in multiple sources
- Dark/light theming: MEDIUM -- approach is sound but specific override selectors need validation during implementation

**Research date:** 2026-04-03
**Valid until:** 2026-04-17 (14 days -- chatscope is stable, codebase is under our control)
