# Feature Landscape: Chat Message Classifier Improvement + Feedback UI

**Domain:** Terminal output classification for Claude Code + GSD dashboard chat
**Researched:** 2026-04-04
**Overall confidence:** HIGH (verified against live tmux captures, GSD source files, and Claude Code terminal output)

---

## Complete Taxonomy of Claude Code + GSD Terminal Output

Every line visible in a Claude Code tmux session belongs to one of the categories below. This taxonomy was built from:
- Live tmux captures of active sessions (gsddashboard, KidAI)
- GSD workflow source files (ui-brand.md, checkpoints.md, execute-phase.md, continuation-format.md)
- Claude Code CLI behavior observed in real terminal sessions
- Existing classifier test fixtures (server/__tests__/fixtures/tmux-samples.js)

### Category 1: Claude Code Chrome (HIDDEN)

Lines produced by the Claude Code CLI itself, not by Claude's responses. Should never appear in chat.

| Sub-type | Pattern | Example | Confidence |
|----------|---------|---------|------------|
| Tool call header | `Read(`, `Write(`, `Edit(`, `Bash(`, `Grep(`, `Glob(`, `WebSearch(`, `WebFetch(`, `TodoWrite(`, `Agent(`, `Search(` | `Read(server/db.js)` | HIGH |
| Bullet tool call | `bullet ToolName(...)` | `bullet Bash(npm run build)` | HIGH |
| Update tool call | `bullet Update(...)` | `bullet Update(.planning/PROJECT.md)` | HIGH |
| Tool result continuation | Line starts with `hook-left` | `hook-left  Done (exit 0)` | HIGH |
| Collapsed output | `... +N lines (ctrl+o to expand)` | `... +42 lines (ctrl+o to expand)` | HIGH |
| Collapsed read summary | `Read N files (ctrl+o to expand)` | `Read 3 files (ctrl+o to expand)` | HIGH |
| Listed directory summary | `Listed N director(y/ies) (ctrl+o to expand)` | `Listed 1 directory (ctrl+o to expand)` | HIGH |
| Numbered code lines | `  N \| code` pattern | `  15 \| function foo() {` | HIGH |
| Working spinner | `star Working/Baked/Cogitated for...` | `star Baked for 6m 37s` | HIGH |
| Completion spinner | `six-star Cooked for...` | `six-star Cooked for 13m 35s` | HIGH |
| All animation chars | `star`, `six-star`, `heavy-star`, `eight-star`, `teardrop`, `four-balloon` | Claude Code cycles through 6 symbols | HIGH |
| User input echo | Line starts with `right-arrow` | `right-arrow /gsd:quick fix the bug` | HIGH |
| Timer/thinking | `(Ns middle-dot down-arrow N)` or `(thinking)` | `(4m 19s middle-dot down-arrow 539 tokens)` | HIGH |
| JSON tool result | Line starts with `{` followed by space or `"` | `{ "path": "server/db.js" }` | HIGH |
| MCP/ANTML calls | `mcp__` or `antml_` prefix | `mcp__dashboard__list_sessions` | HIGH |
| Status bar | Bottom line with model name, percentage, permissions | `double-play bypass permissions on middle-dot 6 background tasks` | HIGH |
| Reading/Writing/Searching progress | Progress indicators without bullet | `Reading server/db.js` | HIGH |
| Background task tree | Indented tree with branch chars | `tree-branch Stack research v4.1` / `tree-end Pitfalls research v4.1` | HIGH |
| Session feedback prompt | Rating from Claude Code | `bullet How is Claude doing this session? (optional)` | MEDIUM |
| Diff output inside Update blocks | Lines with `+`/`-` prefix in tool result context | `+- checkmark Chat-first UI: ...` | HIGH |
| Selection UI chrome | Horizontal separator lines, nav hints | `Enter to select middle-dot up/down to navigate middle-dot Esc to cancel` | HIGH |
| Checkbox/submit UI | Selection state indicators | `left-arrow  box Trust  check Submit  right-arrow` | HIGH |

**Note on Unicode symbols above:** The actual characters are: `bullet` = solid circle, `hook-left` = left hook continuation marker, `star` = teardrop-spoked asterisk, `six-star` = six-pointed black star, `right-arrow` = right-pointing arrow, `middle-dot` = middle dot, `down-arrow` = downward arrow, `tree-branch/end` = box-drawing chars. These render in terminal with ANSI styling.

### Category 2: GSD Stage Banners (STAGE_BANNER)

Visual separators from GSD workflows marking major transitions. Should appear as prominent section headers in chat.

| Sub-type | Pattern | Example | Confidence |
|----------|---------|---------|------------|
| GSD full banner | Heavy horizontal rules with `GSD (right-triangle)` between them | `GSD (right-triangle) RESEARCHING` | HIGH |
| Phase heading | `## Phase N:` or `### Phase N` | `## Phase 28: Schema + Classifier Foundation` | HIGH |
| Wave marker | `Wave N:` | `Wave 2: Parallel execution batch` | HIGH |
| Plan/Execute/Research label | `PLAN:`, `EXECUTE:`, `RESEARCH:` | `EXECUTE: Build chat message components` | HIGH |
| Separator banners | `=== text ===` | `=== Execution Wave 1 ===` | HIGH |
| Planning complete | `## PLANNING COMPLETE` | `## PLANNING COMPLETE` | HIGH |
| Gap closure | `## GAP CLOSURE:` | `## GAP CLOSURE: Missing auth middleware` | HIGH |
| Milestone complete banner | Banner with `MILESTONE vX.Y COMPLETE` | Part of full banner block | HIGH |
| Phase complete banner | Banner with `PHASE N COMPLETE` | Part of full banner block | HIGH |
| Auto-advance box | Double-line box with `AUTO-ADVANCING` | See execute-phase.md | HIGH |
| Step marker | `bullet Step N: Name` (bullet prefix + Step) | `bullet Step 7: Commit and Tag` | HIGH |

**Critical gap in current classifier:** The GSD banner format uses heavy horizontal rules (`heavy-dash` x 53) as framing, but the current regex only matches `## Phase N` and `===` separators. The actual `GSD (right-triangle) STAGE` line appears BETWEEN two horizontal rules and is not currently matched as a banner.

### Category 3: GSD Checkpoints (CHECKPOINT)

User action required. Must be prominently displayed with actionable buttons.

| Sub-type | Pattern | Example | Confidence |
|----------|---------|---------|------------|
| Checkpoint box header | Double-line box: `CHECKPOINT: Type` | `CHECKPOINT: Verification Required` | HIGH |
| YOUR ACTION line | `YOUR ACTION:` or `right-arrow YOUR ACTION:` | `right-arrow YOUR ACTION: Type "approved" or describe issues` | HIGH |
| Verify prompt | `VERIFY:` prefix | `VERIFY: Run npm test and confirm all pass` | HIGH |
| Checkpoint label | `Checkpoint:` prefix | `Checkpoint: Confirm the UI renders correctly` | HIGH |
| Progress in checkpoint | `Progress: N/M tasks complete` | `Progress: 5/8 tasks complete` | HIGH |

**Note:** Checkpoints use the double-line box format from ui-brand.md. The box itself spans 3+ lines (top border, content, bottom border, then the action prompt with single-line borders). The current classifier only matches the `YOUR ACTION:` line -- it misses the box framing and context.

### Category 4: Completions (COMPLETION)

Phase/plan/milestone done. Should appear as success cards in chat.

| Sub-type | Pattern | Example | Confidence |
|----------|---------|---------|------------|
| Phase complete | `PHASE COMPLETE` | `PHASE COMPLETE` | HIGH |
| All plans done | `All plans/tasks executed/finished/complete` | `All plans executed successfully` | HIGH |
| Summary written | `SUMMARY.md written` | `SUMMARY.md written to .planning/phases/28-...` | HIGH |
| Milestone complete | `MILESTONE COMPLETE` or `MILESTONE vX.Y COMPLETE` | In GSD banner context | HIGH |
| Phase complete summary | `Phase {X}: {Name} Execution Complete` | See execute-phase aggregate | HIGH |

### Category 5: Errors (ERROR)

Errors from builds, commands, runtime. Should appear as red error cards.

| Sub-type | Pattern | Example | Confidence |
|----------|---------|---------|------------|
| JS errors | `TypeError:`, `SyntaxError:`, `ReferenceError:` | `TypeError: Cannot read properties of undefined` | HIGH |
| System errors | `ENOENT`, `EACCES`, `ECONNREFUSED` | `ENOENT: no such file or directory` | HIGH |
| npm errors | `npm ERR!` | `npm ERR! code ELIFECYCLE` | HIGH |
| Generic errors | `Error:`, `ERROR:`, `FAILED:`, `FATAL:` | `FATAL: database connection lost` | HIGH |
| Unhandled | `Unhandled` | `Unhandled promise rejection` | HIGH |

**False positive risk:** Prose like `I fixed the Error handling` or `After the FAILED attempt, I tried...` matches these patterns. Current classifier has no context awareness -- it matches the first occurrence of the keyword regardless of surrounding text. Mitigation: require that error keywords appear at the START of the line (`^Error:`) which the current patterns already do. But some edge cases remain with wrapped lines.

### Category 6: Claude's Prose (TEXT)

Claude's actual reasoning, explanations, and narrative. This is the primary content the user wants to see in chat.

| Sub-type | Pattern | Example | Confidence |
|----------|---------|---------|------------|
| Explanation text | No special prefix, natural language | `I will now implement the classifier module.` | HIGH |
| Reasoning with bullet | `bullet Let me...`, `bullet Now...`, `bullet Great...` | `bullet Let me update MILESTONES.md` | HIGH |
| Spawning indicator | `diamond Spawning...` | `diamond Spawning 4 researchers in parallel...` | HIGH |
| Arrow list items | `right-arrow item` | `right-arrow Stack, Features, Architecture, Pitfalls` | HIGH |
| Status symbols in prose | `checkmark Complete`, `cross Failed` | `checkmark Researcher complete: STACK.md written` | HIGH |
| Agent launch announcement | `bullet N background agents launched...` | `bullet 4 background agents launched (down-arrow to manage)` | HIGH |
| Progress bar display | `Progress: filled/empty blocks NN%` | `Progress: 80% filled bar` | HIGH |
| User answered summary | `bullet User answered Claude's questions:` | See tmux capture | HIGH |
| Table output | Markdown table lines with pipes | Standard markdown table format | HIGH |
| Completion metric tables | Box-drawing tables | Unicode box table with Phase/Plans/Status | HIGH |

### Category 7: GSD Continuation Blocks (NEXT_UP -- new type)

"Next Up" blocks with copy-paste commands. Should render as tappable action cards.

| Sub-type | Pattern | Example | Confidence |
|----------|---------|---------|------------|
| Next Up header | `## (right-triangle) Next Up` or `(right-triangle) Next Up` | `(right-triangle) Next Up` | HIGH |
| Command suggestion | Backtick-wrapped `/gsd:command` | `/gsd:execute-phase 2` | HIGH |
| Clear reminder | `/clear first` | `/clear first (right-arrow) fresh context window` | HIGH |
| Also available | `**Also available:**` followed by bullet commands | See continuation-format.md | HIGH |
| Phase complete + next | `## checkmark Phase N Complete` | `## checkmark Phase 2 Complete` | HIGH |
| Milestone complete + next | `Milestone vX.Y Complete` + next command | See continuation-format.md | HIGH |

---

## What the Current Classifier Gets WRONG

Based on analysis of real tmux captures vs. current patterns in `classifierPatterns.js`:

### Missing HIDDEN Patterns (leak through as TEXT)

| What leaks | Example | Fix |
|-----------|---------|-----|
| `bullet Update(...)` tool call | `bullet Update(.planning/PROJECT.md)` | Add `Update` to bullet tool call regex |
| `Read N files (ctrl+o to expand)` | Collapsed read summary | New pattern: `/^Read \d+ files?/` |
| `Listed N director` | Collapsed dir summary | New pattern: `/^Listed \d+ director/` |
| Background task tree lines | `tree-branch Stack research v4.1` | New pattern: `/^[├└]/` (box-drawing tree chars) |
| `Added N lines, removed N lines` | Diff summary from Update() | New pattern: `/^Added \d+ lines/` |
| Selection UI navigation hints | `Enter to select` | New pattern: `/^Enter to select/` |
| Checkbox/submit bar | Left/right arrows with squares/checks | New pattern: match selection chrome |
| Selection items with brackets | `N. [ ] Option text` | New pattern: `/^\s*\d+\.\s*\[[ x]\]/` |
| Multi-line user echo (after right-arrow) | Continuation of user input | Track state: lines after right-arrow until next bullet |
| Session rating prompt | `bullet How is Claude doing` | New pattern: `/How is Claude doing/` |

### Missing STAGE_BANNER Patterns

| What's missed | Example | Fix |
|--------------|---------|-----|
| GSD heavy-rule banner | The `heavy-dash` x 53 horizontal rules | Match heavy horizontal rule lines |
| `GSD right-triangle STAGE` between rules | `GSD right-triangle RESEARCHING` | New pattern: `/GSD\s*[►▶]\s*\w/` |
| `bullet Step N:` markers | `bullet Step 7: Commit and Tag` | New pattern: `/^●\s*Step\s+\d+/` |
| Execution plan header | `## Execution Plan` | Already matched by `##` heading? Needs verification |

### Missing NEXT_UP Type (all currently classified as TEXT)

| What's missed | Pattern | Fix |
|--------------|---------|-----|
| Next Up header | `(right-triangle) Next Up` | New type: NEXT_UP |
| GSD command in backticks | `/gsd:command-name` | Detect within NEXT_UP context |
| Also available block | `**Also available:**` | Part of NEXT_UP context |
| Clear reminder | `/clear first` | Part of NEXT_UP context |

### False Positive Risks in Current Patterns

| Pattern | False positive example | Severity |
|---------|----------------------|----------|
| Numbered code `\d+ \|` | Markdown table lines `\| Phase \| Status \|` | LOW (tables start with `\|`, code lines start with spaces+digits) |
| `^Error:` prefix | Rare in prose, mostly safe | LOW |
| `PHASE COMPLETE` in prose | `After phase completion` would not match (case + exact) | LOW |

---

## Table Stakes Features

Features users expect. Missing = chat feels unreliable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Expand HIDDEN patterns | 10+ sub-types currently leak into chat as TEXT | Medium | See "Missing HIDDEN Patterns" table above |
| GSD banner recognition | Real banners use heavy-dash framing, not just `##` | Medium | Match `GSD right-triangle` and heavy horizontal rules |
| Next Up block type | Primary workflow interaction point shows as plain text | Medium | New message type with tappable commands |
| Message feedback UI | Only way to iteratively improve classifier | Medium | Right-click/long-press correction flow |
| Feedback storage | Corrections useless without persistence | Low | New DB table: message_id, original_type, corrected_type, raw_content |
| Auto-reclassify on feedback | Immediate visual fix when user flags a message | Low | UPDATE gsd_messages SET message_type WHERE id |
| tmux -J line joining | Long Claude paragraphs split into fragments | Low | Single flag addition to capture-pane call |
| Send confirmation echo | After sending a command, user sees their message immediately | Low | Optimistic insert into chat |

## Differentiators

Features that elevate chat above basic terminal viewing.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Feedback-to-pattern pipeline | Aggregate corrections suggest new regex patterns | High | Claude reads feedback DB via `/gsd:quick` |
| Pattern test endpoint | POST a sample line, get classification result | Low | Reuses classifyLine() -- great for debugging |
| Step progress rendering | `bullet Step N:` lines shown as progress tracker | Medium | Visual step indicator |
| Checkpoint box parsing | Multi-line checkpoint rendered as interactive card | Medium | Parse box format, extract options |
| Rate limit detection in chat | Show rate limit as special warning message | Low | Already detected in tmux.js |
| Confidence indicator | Show which messages were pattern-matched vs. fell through to TEXT | Low | Informs user which messages might be wrong |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| ML/NLP classifier | Massive complexity for ~25 pattern types; single-user tool with predictable output | Regex pipeline with feedback loop |
| Pattern editor UI in dashboard | Premature; patterns are a developer concern | API endpoints; manage via GSD quick tasks |
| Dynamic patterns in SQLite | Over-engineering; patterns change rarely and need testing | Keep patterns in JS file; feedback informs manual updates |
| Full message editing | Users need to reclassify type, not edit content | Context menu offers type correction only |
| Character-by-character streaming | Claude Code buffers output; tmux capture is periodic polling | Poll-based diff is the correct approach |
| Rendering hidden messages on toggle | "Show hidden" toggle adds complexity for minimal value | Keep hidden messages permanently filtered |

---

## Feature Dependencies

```
tmux -J flag fix --> cleaner input --> fewer split text fragments
                 \
Expand HIDDEN patterns --> fewer noise messages in chat
                       \
GSD banner recognition ---> Next Up block type (banners mark context)
                       \
Checkpoint box parsing ---> Tappable action buttons (already partial)

Feedback storage (SQLite table) --> Message feedback UI (right-click/long-press)
                                --> Auto-reclassify on feedback
                                --> Feedback-to-pattern pipeline (deferred)

Send confirmation echo --> Working status instant update (both fire on send)
```

## MVP Recommendation

**Priority 1 (must ship for v4.1):**
1. **Expand HIDDEN patterns** -- catch all 10+ leaking sub-types (Update tool, collapsed summaries, tree lines, selection UI, etc.)
2. **Fix GSD banner matching** -- match actual `GSD right-triangle` format and heavy horizontal rules
3. **Message feedback UI** -- right-click/long-press context menu with type correction
4. **Feedback storage** -- new `gsd_message_feedback` table
5. **Auto-reclassify on feedback** -- immediate visual correction
6. **tmux -J flag** -- 1-line fix, immediate improvement to line fragmentation

**Priority 2 (should ship if time permits):**
7. **Next Up message type** -- new type with tappable command rendering
8. **Send confirmation echo** -- optimistic message insert on send
9. **Working status instant update** -- broadcast on send-keys
10. **Pattern test endpoint** -- POST sample line, get classification result

**Defer to v4.2+:**
- Feedback-to-pattern auto-suggestion pipeline
- Step progress rendering
- Checkpoint multi-line box parsing
- Rate limit chat messages
- Confidence indicators

---

## Feedback Loop Design

### How the correction cycle works

```
User sees wrong message --> Right-click/long-press --> "Flag as wrong type"
  --> Modal/menu: current type shown, pick correct type from dropdown
  --> Optional: text note about why
  --> Submit --> stored in gsd_message_feedback table
  --> Message immediately re-rendered with corrected type in UI
  --> Correction count badge appears on message (shows it was manually fixed)

Developer reviews feedback periodically:
  --> API endpoint: GET /api/gsd/feedback?project=X (or all)
  --> Returns: raw_content, original_type, corrected_type, frequency
  --> Analyze patterns via /gsd:quick or manual review:
     - "20 messages starting with 'bullet Step' were TEXT, should be STAGE_BANNER"
     - "8 messages containing 'ctrl+o to expand' were TEXT, should be HIDDEN"
  --> New regex pattern added to classifierPatterns.js
  --> Test: npm run test:server confirms no regressions
  --> Deploy: patterns improve for future captures
```

### Database Schema for Feedback

```sql
CREATE TABLE IF NOT EXISTS gsd_message_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES gsd_messages(id),
  original_type TEXT NOT NULL,
  corrected_type TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_type
  ON gsd_message_feedback(original_type, corrected_type);
```

### API Endpoints for Feedback

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/gsd/feedback` | Submit correction: {message_id, corrected_type, note?} |
| GET | `/api/gsd/feedback` | List all feedback, optionally filtered by project |
| GET | `/api/gsd/feedback/summary` | Aggregated: which types are most often wrong, top corrections |
| PATCH | `/api/gsd/messages/:id/reclassify` | Apply correction to stored message |

### Recommended Message Types (Expanded)

**Current types:** `stage_banner`, `checkpoint`, `completion`, `error`, `hidden`, `text`

**Proposed additions for v4.1:**

| Type | What it captures | Chat rendering |
|------|-----------------|----------------|
| `next_up` | `right-triangle Next Up` blocks with GSD commands | Card with tappable command chips |

**Types to consider for v4.2+:**

| Type | What it captures | Chat rendering |
|------|-----------------|----------------|
| `progress` | Spawning indicators, background task lists, step markers | Compact progress line or hidden |
| `interactive` | Selection menus, checkbox UIs | Rendered as interactive selector or hidden |
| `table` | Markdown table output | Rendered as styled table |
| `rate_limit` | Rate limit detection messages | Warning card with reset time |

### Visibility Matrix

| Type | Visible in chat? | Rationale |
|------|-----------------|-----------|
| `text` | YES | Claude's prose -- the main content |
| `stage_banner` | YES | Section structure, shown as headers |
| `checkpoint` | YES | User action required, shown as interactive card |
| `completion` | YES | Success feedback, shown as green card |
| `error` | YES | Failure feedback, shown as red card |
| `next_up` | YES | Actionable commands, shown as tappable card |
| `hidden` | NO | All tool chrome, code lines, spinners, selection UI |

---

## Sources

- GSD ui-brand.md: `/data/home/.claude/get-shit-done/references/ui-brand.md` -- stage banner format, checkpoint box format, status symbols, Next Up block format, progress display, error box, spawning indicators
- GSD checkpoints.md: `/data/home/.claude/get-shit-done/references/checkpoints.md` -- checkpoint execution display format with exact box rendering
- GSD continuation-format.md: `/data/home/.claude/get-shit-done/references/continuation-format.md` -- all Next Up block variants (execute, plan, transition, milestone)
- GSD verification-patterns.md: `/data/home/.claude/get-shit-done/references/verification-patterns.md` -- verification output patterns
- GSD execute-phase.md: `/data/home/.claude/get-shit-done/workflows/execute-phase.md` -- wave execution output, aggregate results format, checkpoint handling display
- GSD execute-plan.md: `/data/home/.claude/get-shit-done/workflows/execute-plan.md` -- plan execution output patterns
- GSD quick.md: `/data/home/.claude/get-shit-done/workflows/quick.md` -- quick task banner formats
- Live tmux captures from gsddashboard and KidAI sessions (2026-04-04) -- real production output
- Existing classifier: `server/gsd/classifierPatterns.js` -- current regex patterns
- Existing test fixtures: `server/__tests__/fixtures/tmux-samples.js` -- current sample data
- Existing classifier engine: `server/gsd/classifier.js` -- TmuxClassifier class with diff/group logic
- Client renderer: `client/src/components/ChatMessageRenderer.tsx` -- current rendering switch
- [Claude Code Output Styles docs](https://code.claude.com/docs/en/output-styles)
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Text Classification Feedback Loop patterns](https://github.com/jonas-nothnagel/Text-Classification-Feedback-Loop)
