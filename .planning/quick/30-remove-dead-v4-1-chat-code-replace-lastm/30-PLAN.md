---
phase: quick-30
plan: 30
type: execute
wave: 1
depends_on: []
files_modified:
  - server/index.js
  - server/routes/gsd.js
  - server/db.js
  - server/gsd/classifier.js
  - server/gsd/patternManager.js
  - server/gsd/classifierPatterns.js
  - server/__tests__/chatMessages.test.js
  - server/__tests__/classifier.test.js
  - client/src/lib/types.ts
  - client/src/lib/api.ts
  - client/src/components/ChatListView.tsx
  - client/src/components/StageBanner.tsx
  - client/src/components/ErrorCard.tsx
  - client/src/components/CompletionCard.tsx
  - client/src/components/CheckpointPrompt.tsx
  - client/src/components/WorkingIndicator.tsx
  - client/src/components/NextUpCard.tsx
  - .planning/STATE.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "Server starts without classifier/patternManager references"
    - "No gsd_messages queries in the /api/gsd/projects response path"
    - "ChatListView shows statusText (tmux task) instead of lastMessage.content"
    - "Dead server files (classifier.js, patternManager.js, classifierPatterns.js) do not exist"
    - "Dead client components (StageBanner, WorkingIndicator, etc.) do not exist"
    - "npm run test:server passes with chatMessages and classifier tests removed"
  artifacts:
    - path: "server/index.js"
      provides: "Server entry — classifier block removed"
    - path: "server/routes/gsd.js"
      provides: "GSD routes — messages/feedback/overrides routes removed, lastMessage removed"
    - path: "server/db.js"
      provides: "DB module — chat/classifier prepared statements removed"
    - path: "client/src/components/ChatListView.tsx"
      provides: "Project list — shows statusText subtitle"
  key_links:
    - from: "server/index.js"
      to: "server/gsd/classifier.js"
      via: "require('./gsd/classifier')"
      pattern: "require.*classifier"
    - from: "client/src/components/ChatListView.tsx"
      to: "GsdProject.lastMessage"
      via: "p.lastMessage?.content"
      pattern: "lastMessage"
---

<objective>
Remove all dead v4.1 chat infrastructure from server and client after the chat window was replaced by the terminal view (quick task 27). Replace `lastMessage` subtitle in ChatListView with `statusText` (the live tmux task line).

Purpose: The classifier polling loop, gsd_messages table queries, feedback/override routes, and associated client types/components are all dead code running wastefully on every server boot. The UI still references lastMessage which is no longer populated.
Output: Clean server with no classifier, clean client types, ChatListView showing statusText, dead files deleted.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/30-remove-dead-v4-1-chat-code-replace-lastm/30-PLAN.md

Key facts:
- server/index.js lines 117-123: TmuxClassifier + PatternManager instantiation block (inside `if (require.main === module)`)
- server/index.js lines 205-232: The `setInterval` that polls classifier every 2.5s plus its `loadGsdConfig` helper
- server/routes/gsd.js lines 73-99: lastMessages db query and lastMsgMap build
- server/routes/gsd.js line 145: `lastMessage: lastMsgMap.get(name) || null` in project response
- server/routes/gsd.js line 261: `stmts.insertGsdMessage.run(name, 'outbound', text)` in send route
- server/routes/gsd.js lines 268-291: GET /projects/:name/messages route
- server/routes/gsd.js lines 496-653: Classifier feedback/overrides routes + require('../gsd/classifierPatterns')
- client/src/components/ChatListView.tsx lines 51-53: `p.lastMessage ? truncate(p.lastMessage.content, 80) : "No messages yet"`
- GsdProject.lastMessage field in client/src/lib/types.ts line 54
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove server-side dead code (classifier loop, routes, db statements, dead files)</name>
  <files>
    server/index.js,
    server/routes/gsd.js,
    server/db.js,
    server/gsd/classifier.js,
    server/gsd/patternManager.js,
    server/gsd/classifierPatterns.js,
    server/__tests__/chatMessages.test.js,
    server/__tests__/classifier.test.js
  </files>
  <action>
    Read each file before editing. Make targeted removals only — preserve all other behavior.

    **server/index.js** — inside the `if (require.main === module)` block:
    1. Remove lines 116-123 (the TmuxClassifier/PatternManager instantiation block):
       - Remove: `// Initialize classifier early...` comment
       - Remove: `const { TmuxClassifier } = require('./gsd/classifier');`
       - Remove: `const { isTmuxSessionActive: isActive } = require('./gsd/tmux');`
       - Remove: `const classifierDb = require('./db');`
       - Remove: `const { broadcast: classifierBroadcast } = require('./websocket');`
       - Remove: `const { PatternManager } = require('./gsd/patternManager');`
       - Remove: `const patternManager = new PatternManager(classifierDb.db);`
       - Remove: `const classifier = new TmuxClassifier(classifierDb.stmts, classifierBroadcast, patternManager);`
    2. Remove the `app.locals.patternManager = patternManager;` and `app.locals.broadcast = classifierBroadcast;` lines
    3. Remove lines 205-232: the `loadGsdConfig` function definition AND the entire `setInterval(() => { ... }, 2500)` classifier poll block (the one with `// TmuxClassifier: poll active projects every 2.5s` comment through its closing `}, 2500)`)

    **server/routes/gsd.js**:
    1. Remove lines 73-99: the entire `lastMessages` db.prepare query and `lastMsgMap` population block
    2. Remove line ~145: `lastMessage: lastMsgMap.get(name) || null,` from the project object (keep `statusText` field if present)
    3. Remove line ~261: `try { stmts.insertGsdMessage.run(name, 'outbound', text); } catch { /* non-blocking */ }` from the send route
    4. Remove lines 268-291: the entire `GET /projects/:name/messages` route handler
    5. Remove lines 496-653: the entire classifier feedback/overrides section:
       - Remove the `// --- Classifier feedback & overrides (Phase 34) ---` comment
       - Remove `const { MESSAGE_TYPES } = require('../gsd/classifierPatterns');`
       - Remove `POST /api/gsd/messages/:id/feedback` route
       - Remove `GET /api/gsd/classifier/feedback` route
       - Remove `GET /api/gsd/classifier/overrides` route
       - Remove `DELETE /api/gsd/classifier/overrides/:id` route

    **server/db.js** — remove only the dead statements, keep all others:
    1. Remove the `CREATE TABLE IF NOT EXISTS gsd_messages` block and its indexes from `ensureTables`
    2. Remove the `CREATE TABLE IF NOT EXISTS classifier_feedback` and `classifier_overrides` migration blocks (lines ~307-334)
    3. Remove prepared statements: `insertGsdMessage`, `listGsdMessages` (the plain one on line ~552), `insertClassifiedMessage`, `listVisibleGsdMessages`, `countGsdMessages`, `getGsdMessage`, `updateMessageType`, `insertFeedback`, `listFeedback`, `listOverrides`, `insertOverride`, `disableOverride`, `bumpOverrideHitCount`
    4. Keep: all session/agent/event/settings/tasks/autopilot statements

    **Delete files** (use Bash to rm):
    - `server/gsd/classifier.js`
    - `server/gsd/patternManager.js`
    - `server/gsd/classifierPatterns.js`
    - `server/__tests__/chatMessages.test.js`
    - `server/__tests__/classifier.test.js`

    After all edits, run: `npm run test:server`
    Fix any import errors or reference errors that surface. The test suite must pass.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -20</automated>
  </verify>
  <done>
    - server/index.js has no references to TmuxClassifier, PatternManager, classifierDb, classifierBroadcast
    - server/index.js has no 2500ms setInterval for classifier
    - server/routes/gsd.js has no lastMessages query, no /messages route, no /classifier/* routes
    - server/db.js has no gsd_messages, classifier_feedback, classifier_overrides tables or related stmts
    - classifier.js, patternManager.js, classifierPatterns.js, chatMessages.test.js, classifier.test.js deleted
    - npm run test:server passes
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove client dead code and replace lastMessage with statusText in ChatListView</name>
  <files>
    client/src/lib/types.ts,
    client/src/lib/api.ts,
    client/src/components/ChatListView.tsx,
    client/src/components/StageBanner.tsx,
    client/src/components/ErrorCard.tsx,
    client/src/components/CompletionCard.tsx,
    client/src/components/CheckpointPrompt.tsx,
    client/src/components/WorkingIndicator.tsx,
    client/src/components/NextUpCard.tsx
  </files>
  <action>
    Read each file before editing. Check for any remaining imports of the deleted components before deleting them.

    **client/src/lib/types.ts**:
    1. Remove `MessageType` type (line ~58)
    2. Remove `GsdMessage` interface (lines ~60-68)
    3. Remove `GsdChatMessageEvent` interface (lines ~205-208)
    4. In `WSMessage` type union, remove `"gsd_chat_message"` and `"gsd_message_updated"` from the type union, and remove `GsdChatMessageEvent` from the data union
    5. In `GsdProject` interface: remove `lastMessage` field (line ~54). Keep `statusText: string | null`.

    **client/src/lib/api.ts**:
    - Check for `api.gsd.feedback()` and `api.gsd.messages()` functions and remove them if present
    - If api.ts doesn't import GsdMessage, no change needed there

    **client/src/components/ChatListView.tsx**:
    Replace the `info` computation (lines 51-53):
    ```tsx
    // OLD:
    const info = p.lastMessage
      ? truncate(p.lastMessage.content, 80)
      : "No messages yet";

    // NEW:
    const info = p.statusText
      ? truncate(p.statusText, 80)
      : capitalize(p.sessionState);
    ```
    This shows the current tmux task (e.g. "planning Phase 31") or falls back to session state ("Working", "Idle").

    **Delete files** using Bash rm:
    First grep each file for imports in the codebase to confirm they are safe to delete:
    - `client/src/components/StageBanner.tsx`
    - `client/src/components/ErrorCard.tsx`
    - `client/src/components/CompletionCard.tsx`
    - `client/src/components/CheckpointPrompt.tsx`
    - `client/src/components/WorkingIndicator.tsx`
    - `client/src/components/NextUpCard.tsx`

    After deletions, run: `npm run test:client`
    Fix any TypeScript errors from removed types.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>
    - GsdProject no longer has lastMessage field in types.ts
    - MessageType, GsdMessage, GsdChatMessageEvent types removed
    - ChatListView shows statusText or sessionState as subtitle (no reference to lastMessage)
    - Dead components deleted (StageBanner, ErrorCard, CompletionCard, CheckpointPrompt, WorkingIndicator, NextUpCard)
    - npm run test:client passes (or no client tests affected)
  </done>
</task>

<task type="auto">
  <name>Task 3: Update planning docs (STATE.md)</name>
  <files>
    .planning/STATE.md
  </files>
  <action>
    Read .planning/STATE.md.

    In the `## Accumulated Context` > `### Decisions` section, add a new entry after the last v4.1 decision:
    - `[quick-30]: Removed all v4.1 chat infrastructure (classifier, gsd_messages, feedback routes) — superseded by terminal-first approach (quick tasks 27-30). ChatListView now shows statusText (tmux task) instead of lastMessage.`

    In `### Blockers/Concerns` section, remove the two stale entries:
    - "Classifier auto-fix complexity: updating regex patterns at runtime from user feedback is non-trivial"
    - "Working status depends on tmux capture-pane polling interval (currently 2.5s)"

    Update `last_activity` in the frontmatter to: `2026-04-05 — Completed quick task 30: Remove dead v4.1 chat code, replace lastMessage with statusText`

    Update `Quick Tasks Completed` table: add row for task 30.
  </action>
  <verify>
    <automated>grep -c "quick-30" /data/home/gsddashboard/.planning/STATE.md</automated>
  </verify>
  <done>
    STATE.md records the architectural pivot decision, stale blockers removed, quick task 30 logged.
  </done>
</task>

</tasks>

<verification>
After all 3 tasks complete:
1. `npm run test:server` passes with no reference to classifier/chatMessages tests
2. `npm run test:client` passes with no type errors from removed GsdMessage types
3. `npm run build` succeeds (no dead imports)
4. No files reference deleted components or classifierPatterns
</verification>

<success_criteria>
- Server boots without TmuxClassifier, PatternManager, or 2.5s classifier poll
- /api/gsd/projects no longer queries gsd_messages table
- ChatListView subtitle shows statusText (current tmux task) instead of lastMessage.content
- 9 dead files deleted: 3 server/gsd, 2 server/__tests__, 6 client/src/components (minus StageBanner etc.)
- All test suites pass
- STATE.md updated with architectural decision record
</success_criteria>

<output>
After completion, commit with message: `chore(quick-30): remove dead v4.1 chat code, replace lastMessage with statusText`
Then push and deploy: `git push && railway up --detach`
</output>
