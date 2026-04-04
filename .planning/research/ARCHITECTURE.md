# Architecture: Classifier Feedback Loop and Auto-Fix System

**Domain:** Chat message classifier feedback pipeline
**Researched:** 2026-04-03
**Confidence:** HIGH (all components are internal, patterns well-understood)

## Current Architecture (Baseline)

```
tmux capture-pane
  |
  v
TmuxClassifier.poll()  -->  classifyChunks()  -->  PATTERNS (static array in classifierPatterns.js)
  |                                                    |
  |  diff new lines                                    |  first regex match wins
  |                                                    v
  |                                            { msg_type, content }
  v
insertClassifiedMessage  -->  gsd_messages table  -->  WebSocket broadcast
                                                         |
                                                         v
                                                  ChatMessageRenderer (switch on msg_type)
```

**Key constraints from current code:**
- `PATTERNS` in `classifierPatterns.js` is a static JS array, evaluated top-to-bottom, first match wins
- `classifyLine()` is a pure function: strip ANSI, trim, test each pattern group in order
- Lines matching no pattern default to `text`
- `gsd_messages` stores: `id, project, direction, content, message_type, metadata, created_at`
- Messages are already persisted with their classified `message_type` -- this is the field feedback corrects
- `TmuxClassifier` receives `stmts` (prepared statements) and `broadcast` via constructor

---

## Recommended Architecture: Feedback Pipeline

```
User right-clicks/long-presses message in ChatMessageRenderer
  |
  v
POST /api/gsd/messages/:id/feedback  { correct_type: "hidden" | "text" | ... }
  |
  v
Server:
  1. Insert into classifier_feedback table (audit log)
  2. Derive regex pattern override from content + correct_type
  3. Upsert into classifier_overrides table
  4. Hot-reload override into PatternManager's in-memory list
  5. Update the original message's message_type in gsd_messages
  6. Broadcast correction via WebSocket (gsd_message_updated)
  |
  v
Client: update message in place (optimistic update, reconcile on WS confirm)

Future tmux output matching the derived pattern --> auto-classified correctly
```

### Component Boundaries

| Component | Responsibility | New/Modified |
|-----------|---------------|--------------|
| `server/gsd/patternManager.js` | Merges static PATTERNS + DB overrides, provides `classifyLine()`/`classifyChunks()` | **NEW** |
| `server/gsd/classifier.js` | Accepts PatternManager via constructor, uses it instead of raw classifyChunks | **MODIFY** (2 lines) |
| `server/gsd/classifierPatterns.js` | Static regex baseline -- NEVER modified by the system | **NONE** |
| `server/db.js` | Migration for 2 new tables + 5 new prepared statements | **MODIFY** |
| `server/routes/gsd.js` | Feedback endpoint, overrides admin endpoints | **MODIFY** |
| `server/index.js` | Instantiate PatternManager, pass to TmuxClassifier | **MODIFY** (3 lines) |
| `client/src/lib/types.ts` | Add `gsd_message_updated` to WSMessage union | **MODIFY** |
| `client/src/components/ChatMessageRenderer.tsx` | Add context menu / long-press for feedback | **MODIFY** |
| `client/src/components/ChatWindow.tsx` | Handle `gsd_message_updated` WS events, call feedback API | **MODIFY** |

---

## Database Schema: Two New Tables

### Table: `classifier_feedback` (audit log)

Every user correction is logged here for analysis, even if it duplicates a prior override.

```sql
CREATE TABLE IF NOT EXISTS classifier_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  original_type TEXT NOT NULL,
  corrected_type TEXT NOT NULL,
  content_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (message_id) REFERENCES gsd_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_feedback_message ON classifier_feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON classifier_feedback(created_at DESC);
```

### Table: `classifier_overrides` (active runtime patterns)

Each row is a regex that takes precedence over static patterns.

```sql
CREATE TABLE IF NOT EXISTS classifier_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('text','stage_banner','checkpoint','completion','error','hidden')),
  priority INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'feedback' CHECK(source IN ('feedback','manual')),
  enabled INTEGER NOT NULL DEFAULT 1,
  hit_count INTEGER NOT NULL DEFAULT 0,
  feedback_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (feedback_id) REFERENCES classifier_feedback(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_overrides_enabled ON classifier_overrides(enabled, priority DESC);
```

**Column rationale:**
- `pattern`: regex string derived from the corrected message content
- `target_type`: what the pattern should classify lines as
- `priority`: higher wins; manual overrides can beat auto-derived ones
- `enabled`: soft-delete without losing history
- `hit_count`: tracks how often this override fires (useful for pruning stale overrides)
- `feedback_id`: links back to the creating feedback record (nullable for manual overrides)

### New Prepared Statements (added to `server/db.js` stmts)

```javascript
stmts.getGsdMessage = db.prepare('SELECT * FROM gsd_messages WHERE id = ?');
stmts.updateMessageType = db.prepare('UPDATE gsd_messages SET message_type = ? WHERE id = ?');
stmts.insertFeedback = db.prepare(
  `INSERT INTO classifier_feedback (message_id, original_type, corrected_type, content_snapshot)
   VALUES (?, ?, ?, ?)`
);
stmts.listOverrides = db.prepare(
  'SELECT * FROM classifier_overrides WHERE enabled = 1 ORDER BY priority DESC, id DESC'
);
stmts.disableOverride = db.prepare(
  'UPDATE classifier_overrides SET enabled = 0 WHERE id = ?'
);
```

---

## PatternManager: The Core New Component

File: `server/gsd/patternManager.js`

### Responsibilities

1. **On startup:** Load `classifier_overrides` from DB where `enabled = 1`, compile into RegExp objects
2. **On classify:** Check overrides first (priority order), then static PATTERNS, then default to `text`
3. **On feedback:** Derive pattern, insert override, hot-reload into memory (no restart needed)
4. **On disable:** Remove override from memory, set `enabled = 0` in DB

### Classification Order (Three-Tier)

```
1. DB overrides (sorted by priority DESC, then id DESC)
   -- First match wins within overrides
   -- These take absolute precedence over static patterns

2. Static PATTERNS from classifierPatterns.js
   -- Unchanged from current behavior
   -- First match wins within static patterns

3. Default: 'text' (no match anywhere)
```

### Pattern Derivation Strategy (Auto-Fix Logic)

When a user corrects a message, the system must create a regex that matches similar future content. The strategy is deliberately simple because terminal output has predictable structure:

**Step 1: Extract prefix**
Take the first line of the corrected content, escape regex special characters, truncate to 40 characters, anchor to start of line.

```javascript
function derivePattern(content) {
  const firstLine = content.split('\n')[0].trim();
  const escaped = firstLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefix = escaped.substring(0, 40);
  return `^${prefix}`;
}
```

**Step 2: Deduplication check**
Before inserting, check if an existing enabled override already matches this content with the same target type. If so, just log the feedback -- do not create a duplicate override.

**Step 3: Conflict resolution**
If an existing override matches but targets a different type, the new feedback wins (user explicitly corrected). Disable the old override, create a new one with higher priority.

### Code Structure

```javascript
// server/gsd/patternManager.js
'use strict';
const { classifyLine: staticClassifyLine } = require('./classifierPatterns');
const stripAnsi = require('strip-ansi');

class PatternManager {
  constructor(db) {
    this.db = db;
    this.overrides = []; // { id, pattern, target_type, priority, regex }
    this.loadOverrides();
  }

  loadOverrides() {
    const rows = this.db.prepare(
      'SELECT * FROM classifier_overrides WHERE enabled = 1 ORDER BY priority DESC, id DESC'
    ).all();
    this.overrides = rows.map(row => ({
      ...row,
      regex: new RegExp(row.pattern),
    }));
  }

  classifyLine(rawLine) {
    const clean = stripAnsi(rawLine).trim();
    if (!clean) return null;

    // Tier 1: DB overrides
    for (const override of this.overrides) {
      if (override.regex.test(clean)) {
        // Non-blocking hit count bump
        this.db.prepare(
          'UPDATE classifier_overrides SET hit_count = hit_count + 1 WHERE id = ?'
        ).run(override.id);
        return { msg_type: override.target_type, content: clean, metadata: null };
      }
    }

    // Tier 2+3: static patterns + default (delegate to existing pure function)
    return staticClassifyLine(rawLine);
  }

  classifyChunks(rawText) {
    return rawText.split('\n').map(line => this.classifyLine(line)).filter(Boolean);
  }

  addOverride(pattern, targetType, feedbackId) {
    const result = this.db.prepare(
      'INSERT INTO classifier_overrides (pattern, target_type, feedback_id) VALUES (?, ?, ?)'
    ).run(pattern, targetType, feedbackId);
    // Hot-reload: prepend to in-memory list (highest priority = checked first)
    this.overrides.unshift({
      id: Number(result.lastInsertRowid),
      pattern,
      target_type: targetType,
      priority: 0,
      enabled: 1,
      hit_count: 0,
      regex: new RegExp(pattern),
    });
    return Number(result.lastInsertRowid);
  }

  disableOverride(id) {
    this.db.prepare('UPDATE classifier_overrides SET enabled = 0 WHERE id = ?').run(id);
    this.overrides = this.overrides.filter(o => o.id !== id);
  }

  // Check if content is already covered by an existing override with matching type
  findExistingOverride(content, targetType) {
    return this.overrides.find(o =>
      o.regex.test(content) && o.target_type === targetType
    ) || null;
  }

  // Check if content matches an override with a DIFFERENT type (conflict)
  findConflictingOverride(content, targetType) {
    return this.overrides.find(o =>
      o.regex.test(content) && o.target_type !== targetType
    ) || null;
  }
}

module.exports = { PatternManager };
```

---

## Integration Points

### 1. TmuxClassifier Modification (Minimal)

```javascript
// Before (classifier.js line 4):
const { classifyChunks } = require('./classifierPatterns');

// After: PatternManager injected via constructor
class TmuxClassifier {
  constructor(stmts, broadcast, patternManager) {  // added param
    this.stmts = stmts;
    this.broadcast = broadcast;
    this.patternManager = patternManager;           // store it
    this.snapshots = new Map();
  }

  poll(projectName, tmuxSession) {
    // ... existing diff logic unchanged ...
    const chunks = this.patternManager.classifyChunks(newContent);  // changed line
    // ... rest unchanged ...
  }
}
```

### 2. Server Initialization (server/index.js)

```javascript
const { PatternManager } = require('./gsd/patternManager');
const patternManager = new PatternManager(db);

// Pass to TmuxClassifier (existing construction site)
const classifier = new TmuxClassifier(stmts, broadcast, patternManager);

// Also expose patternManager on app for route access
app.locals.patternManager = patternManager;
```

### 3. New API Route: `POST /api/gsd/messages/:id/feedback`

Added to `server/routes/gsd.js`.

```
Request:  { correct_type: "hidden" | "text" | "error" | "stage_banner" | "checkpoint" | "completion" }
Response: { ok: true, override_id: number | null, message: { id, message_type, ... } }
```

**Pipeline (10 steps):**

1. Fetch original message from `gsd_messages` by `id`
2. Validate `correct_type` is a valid MessageType
3. If `correct_type === original.message_type`, return early (no-op)
4. Insert into `classifier_feedback` (audit log)
5. Derive regex pattern from content via `derivePattern()`
6. Check for duplicate override (same pattern, same target) -- skip creation if exists
7. Check for conflicting override (same pattern, different target) -- disable conflict if exists
8. If new pattern needed, call `patternManager.addOverride(pattern, correctType, feedbackId)`
9. Update `gsd_messages` SET `message_type = correct_type` WHERE `id = ?`
10. Broadcast `gsd_message_updated` via WebSocket, return updated message

### 4. Admin Routes (for debugging)

```
GET  /api/gsd/classifier/overrides      -- List all enabled overrides with hit counts
DELETE /api/gsd/classifier/overrides/:id -- Disable an override (soft delete)
```

### 5. WebSocket: New Event Type

```javascript
broadcast('gsd_message_updated', {
  project: message.project,
  message: { id, project, direction, content, message_type: correct_type, created_at }
});
```

Client handles by replacing the message in local state.

---

## Data Flow: Complete Feedback Cycle (Example)

```
1. User sees "Read(server/db.js)" rendered as a text bubble (should be hidden)

2. User long-presses the message -> context menu:
   [Text] [Hidden] [Error] [Stage Banner] [Checkpoint] [Completion]

3. User taps "Hidden"

4. Client:
   - Optimistic update: message disappears from chat
   - POST /api/gsd/messages/1234/feedback { correct_type: "hidden" }

5. Server:
   a. Reads message 1234: { content: "Read(server/db.js)", message_type: "text" }
   b. Inserts feedback: { message_id: 1234, original: "text", corrected: "hidden" }
   c. Derives pattern: "^Read\\(server\\/db\\.js\\)"
   d. Checks existing overrides: no match -> new override needed
   e. Inserts override: { pattern: "^Read\\(server\\/db\\.js\\)", target_type: "hidden" }
   f. Hot-loads override into PatternManager.overrides array
   g. Updates gsd_messages row 1234: SET message_type = "hidden"
   h. Broadcasts: gsd_message_updated { id: 1234, message_type: "hidden" }

6. ALL future tmux lines starting with "Read(server/db.js" will be classified
   as "hidden" automatically -- no code changes, no restart needed.
```

---

## Persistence Across Server Restarts

All pattern overrides survive restarts because they live in SQLite:

1. `PatternManager` constructor calls `loadOverrides()` on startup
2. Reads all `enabled = 1` rows from `classifier_overrides`
3. Compiles each `pattern` string into a `RegExp`
4. Stores in `this.overrides` array for in-memory matching

**Zero data loss.** Overrides persist in the DB.
**No file modifications.** Static `classifierPatterns.js` is never edited by the system.
**Clean separation.** Static patterns = developer-authored baseline. DB overrides = user-corrected runtime layer.

---

## Patterns to Follow

### Pattern 1: Layered Classification (Override > Static > Default)
**What:** Three-tier pattern evaluation where DB overrides take absolute precedence.
**Why:** Allows runtime corrections without modifying source code. Static patterns remain the stable baseline. Overrides are the "diff" layer on top.

### Pattern 2: Optimistic UI with WebSocket Reconciliation
**What:** Client updates message type immediately on feedback submission, then reconciles when WebSocket confirms.
**Why:** Meets the perceived performance mandate (visible response within one frame). If server rejects, revert with toast.

### Pattern 3: Existing Migration Pattern in db.js
**What:** Use try/catch SELECT to detect missing tables, then CREATE IF NOT EXISTS.
**Why:** Matches the existing migration approach (see lines 132-187, 296-303 of db.js). No separate migration framework needed.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Modifying classifierPatterns.js at Runtime
**What:** Writing to the source JS file to add patterns.
**Why bad:** Requires restart, causes git diffs, fragile file I/O, no rollback capability.
**Instead:** DB overrides with in-memory hot-reload.

### Anti-Pattern 2: Complex NLP/ML for Pattern Derivation
**What:** Using fuzzy matching, LLMs, or similarity scoring to derive patterns from corrected content.
**Why bad:** Over-engineered. Terminal output is structured with predictable prefixes (tool names, error prefixes, status markers). A simple escaped-prefix regex handles 95%+ of cases.
**Instead:** Simple first-line prefix regex. The user provides the intelligence (correct type); the system just needs to match similar lines.

### Anti-Pattern 3: Full Rebuild from Feedback Log
**What:** Re-deriving all overrides from the feedback audit log on every change.
**Why bad:** O(n) rebuild, complex reconciliation, unnecessary when overrides are already correct.
**Instead:** Each feedback creates/updates exactly one override atomically.

### Anti-Pattern 4: Regex Compilation on Every Classify Call
**What:** Compiling RegExp objects inside the hot path of `classifyLine()`.
**Why bad:** Regex compilation is expensive relative to regex testing.
**Instead:** Compile once on load/add, store compiled `RegExp` in the overrides array.

---

## Scalability Considerations

| Concern | At 100 overrides | At 1000 overrides | Mitigation |
|---------|-------------------|---------------------|------------|
| Classification speed | Negligible (<1ms) | ~5ms per line | Batch into single alternation regex if needed |
| Memory | Trivial (~10KB) | ~100KB | Still trivial |
| DB reads on startup | <10ms | ~50ms | One-time cost, acceptable |
| Stale overrides | Manual review | Auto-prune where `hit_count = 0` after 30 days | Cleanup query in maintenance sweep |

Realistically, a single-developer tool will accumulate 50-200 overrides over months. Performance will never be a concern.

---

## File Changes Summary

| File | Change | Description |
|------|--------|-------------|
| `server/gsd/patternManager.js` | **NEW** | PatternManager class: merges static + DB patterns, hot-reload |
| `server/gsd/classifier.js` | **MODIFY** | Accept PatternManager via constructor, call `patternManager.classifyChunks()` |
| `server/gsd/classifierPatterns.js` | **NONE** | Unchanged -- remains the static baseline |
| `server/db.js` | **MODIFY** | Add migration for `classifier_feedback` + `classifier_overrides` tables, 5 new prepared statements |
| `server/routes/gsd.js` | **MODIFY** | Add `POST /messages/:id/feedback`, `GET /classifier/overrides`, `DELETE /classifier/overrides/:id` |
| `server/index.js` | **MODIFY** | Instantiate PatternManager, pass to TmuxClassifier, expose on `app.locals` |
| `client/src/lib/types.ts` | **MODIFY** | Add `gsd_message_updated` WSMessage type |
| `client/src/components/ChatMessageRenderer.tsx` | **MODIFY** | Add context menu / long-press trigger for feedback |
| `client/src/components/ChatWindow.tsx` | **MODIFY** | Handle `gsd_message_updated` WS events, call feedback API |

---

## Sources

- Direct code analysis: `server/gsd/classifierPatterns.js` (PATTERNS array, `classifyLine`, `classifyChunks`)
- Direct code analysis: `server/gsd/classifier.js` (TmuxClassifier constructor, poll loop, groupConsecutiveText)
- Direct code analysis: `server/db.js` (migration pattern, prepared statements pattern, existing gsd_messages schema)
- Direct code analysis: `client/src/lib/types.ts` (MessageType, GsdMessage, WSMessage types)
- Direct code analysis: `client/src/components/ChatMessageRenderer.tsx` (msg_type switch rendering)
- Project context: `.planning/PROJECT.md` (v4.1 milestone goals, feedback loop requirements)
