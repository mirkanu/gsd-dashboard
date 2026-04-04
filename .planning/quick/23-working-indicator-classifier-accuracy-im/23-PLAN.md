---
phase: quick-23
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - server/gsd/classifierPatterns.js
  - server/__tests__/fixtures/tmux-samples.js
  - server/__tests__/classifier.test.js
  - server/gsd/tmux.js
  - server/routes/gsd.js
  - client/src/lib/types.ts
  - client/src/components/WorkingIndicator.tsx
  - client/src/components/ChatWindow.tsx
  - client/src/pages/GSD.tsx
autonomous: true
requirements: [QUICK-23]

must_haves:
  truths:
    - "Tool output lines (bullet tool calls, continuation lines, collapsed markers, status lines) are classified as hidden and never appear in chat"
    - "Working indicator appears at bottom of chat above the send box, not at the top below header"
    - "Working indicator shows actual tmux status text (e.g. 'Working... 1m 17s . 304 tokens') extracted from capture-pane"
  artifacts:
    - path: "server/gsd/classifierPatterns.js"
      provides: "Expanded hidden patterns for tool output"
      contains: "⎿"
    - path: "server/gsd/tmux.js"
      provides: "extractStatusLine function"
      exports: ["extractStatusLine"]
    - path: "client/src/components/WorkingIndicator.tsx"
      provides: "Bottom-positioned indicator with live status text"
    - path: "client/src/components/ChatWindow.tsx"
      provides: "Indicator moved below messages, above send box"
  key_links:
    - from: "server/routes/gsd.js"
      to: "server/gsd/tmux.js"
      via: "extractStatusLine call in project list"
      pattern: "extractStatusLine"
    - from: "client/src/components/ChatWindow.tsx"
      to: "client/src/components/WorkingIndicator.tsx"
      via: "Rendered between message area and send box"
---

<objective>
Move the working indicator from the top of chat to the bottom (typing indicator position) and show the actual tmux status text. Also expand classifier patterns to hide tool output that currently leaks into chat.

Purpose: Better chat UX — typing indicators belong at the bottom, and tool output noise should be hidden.
Output: Improved classifier patterns, bottom-positioned working indicator with live status text.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@server/gsd/classifierPatterns.js
@server/gsd/classifier.js
@server/gsd/tmux.js
@server/routes/gsd.js
@client/src/components/ChatWindow.tsx
@client/src/components/WorkingIndicator.tsx
@client/src/lib/types.ts
@client/src/pages/GSD.tsx
@server/__tests__/classifier.test.js
@server/__tests__/fixtures/tmux-samples.js

<interfaces>
<!-- Key types the executor needs -->

From client/src/lib/types.ts:
```typescript
export interface GsdProject {
  name: string;
  // ... existing fields ...
  contextTokens: number | null;
  sessionUpdatedAt: string | null;
  sessionState: SessionState;
  lastMessage: { content: string; message_type: string; created_at: string } | null;
  // statusText: string | null;  ← ADD THIS
}
```

From client/src/pages/GSD.tsx (two ChatWindow usages):
- Line 1095: Desktop 3-column layout (passes selectedProj?.*)
- Line 1195: Mobile layout (passes proj?.*)
Both need `statusText={proj?.statusText ?? null}` added.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Expand classifier hidden patterns + extract status line from tmux</name>
  <files>server/gsd/classifierPatterns.js, server/__tests__/fixtures/tmux-samples.js, server/__tests__/classifier.test.js, server/gsd/tmux.js, server/routes/gsd.js</files>
  <behavior>
    - Classifier: `● Bash(npm run build)` → hidden
    - Classifier: `● Read(server/db.js)` → hidden
    - Classifier: `● Edit(file.js)` → hidden
    - Classifier: `● Skill(/gsd:quick)` → hidden
    - Classifier: `⎿  result output here` → hidden (continuation line)
    - Classifier: `… +42 lines (ctrl+o to expand)` → hidden (collapsed marker)
    - Classifier: `✻ Working… (1m 17s · ↓ 304 tokens · thought for 3s)` → hidden (status line)
    - Classifier: `✶ Cooked for 13m 35s` → hidden (completion status)
    - Classifier: `❯ some user input` → hidden (user prompt echo)
    - Classifier: Lines starting with `{` followed by JSON-like content → hidden (tool result JSON)
    - extractStatusLine: Given raw tmux text, returns the last status line matching `✻` or `✶` patterns, or null
  </behavior>
  <action>
1. Add new hidden pattern groups to PATTERNS array in classifierPatterns.js (before the existing "Hidden: working/thinking" group):
   - Bullet tool calls: `/^●\s+(?:Bash|Read|Write|Edit|Grep|Glob|WebSearch|WebFetch|TodoWrite|Search|Agent|Skill)\(/` — tool invocations with bullet prefix
   - Continuation lines: `/^⎿/` — tool result continuation marker
   - Collapsed markers: `/^…\s*\+\d+\s+lines/` — collapsed output indicator
   - Status lines: `/^[✻✶]/` — working/completion status indicators (star symbols)
   - User prompt echo: `/^❯/` — user input echo in tmux
   - JSON result blocks: `/^\{[\s"]/` — opening brace of JSON tool results

2. Add matching test fixtures to tmux-samples.js:
   - New array `hiddenToolOutputSamples` with real examples: `'● Bash(npm run build)'`, `'● Read(server/db.js)'`, `'● Edit(src/app.tsx)'`, `'● Skill(/gsd:quick)'`, `'⎿  result text here'`, `'⎿  Done (exit 0)'`, `'… +42 lines (ctrl+o to expand)'`, `'✻ Working… (1m 17s · ↓ 304 tokens · thought for 3s)'`, `'✶ Cooked for 13m 35s'`, `'❯ /gsd:quick fix the bug'`, `'{ "path": "server/db.js" }'`

3. Add test in classifier.test.js for the new fixture array (same pattern as existing fixture tests — iterate array, assert each is MESSAGE_TYPES.HIDDEN).

4. In server/gsd/tmux.js, add `extractStatusLine(rawText)` function:
   - Import `stripAnsi` from `strip-ansi` (already a dependency — used in classifierPatterns.js). Note: tmux.js uses CommonJS, so `const stripAnsi = require('strip-ansi');`
   - Split rawText by newlines, iterate from bottom up
   - Strip ANSI codes from each line, trim
   - Match against `/^[✻✶]/` (same as classifier pattern)
   - Return the first (bottom-most) matching line trimmed, or null
   - If rawText is null/undefined, return null
   - Export it from module.exports

5. In server/routes/gsd.js, in the projects.map() block (around line 122-131 return object):
   - Import `extractStatusLine` alongside existing tmux imports (line 6)
   - When `sessionState === 'working'`, call `extractStatusLine(capturePaneText(tmux_session))` and include as `statusText`. Note: `capturePaneText` is already imported.
   - When not working or no status found, set `statusText: null`
   - Add to return object: `statusText: sessionState === 'working' ? (extractStatusLine(capturePaneText(tmux_session)) || null) : null`
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -30</automated>
  </verify>
  <done>All new tool output patterns classified as hidden. extractStatusLine returns status text from tmux. Server tests pass including new fixture tests. Projects API returns statusText field.</done>
</task>

<task type="auto">
  <name>Task 2: Move working indicator to bottom of chat + thread statusText prop</name>
  <files>client/src/lib/types.ts, client/src/components/WorkingIndicator.tsx, client/src/components/ChatWindow.tsx, client/src/pages/GSD.tsx</files>
  <action>
1. In client/src/lib/types.ts, add `statusText: string | null;` to GsdProject interface (after `lastMessage` field, line 54).

2. Update WorkingIndicator.tsx:
   - Add `statusText?: string | null` prop to WorkingIndicatorProps
   - Change border from `border-b border-emerald-500/20` to `border-t border-emerald-500/20` (now above send box, not below header)
   - When `statusText` is provided and non-empty, display it instead of the generic "Working... {elapsed}" text. The raw status text already contains timing info like "✻ Working... 1m 17s · ↓ 304 tokens", so just display it as-is.
   - When `statusText` is null/empty, fall back to the existing "Working... {elapsed}" display.
   - Keep the pulsing dot and context gauge exactly as they are.

3. Update ChatWindow.tsx:
   - Add `statusText?: string | null` to ChatWindowProps interface
   - REMOVE the WorkingIndicator block from its current position between header and message area (lines 252-258)
   - ADD the WorkingIndicator block between the message area closing div (after line 280) and the command chips block (line 283). Same conditional: `{sessionState === "working" && <WorkingIndicator ... />}`
   - Pass `statusText={statusText}` prop to WorkingIndicator

4. Update client/src/pages/GSD.tsx — two ChatWindow usages need statusText:
   - Line ~1095 (desktop 3-col): Add `statusText={selectedProj?.statusText ?? null}`
   - Line ~1195 (mobile): Add `statusText={proj?.statusText ?? null}`

5. Final layout order should be: Header → Messages → WorkingIndicator (when working) → CommandChips (when waiting) → ReopenConfirm (when shown) → SendBox.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run build 2>&1 | tail -10</automated>
  </verify>
  <done>Working indicator renders at bottom of chat above send box. Shows actual tmux status text when available, falls back to elapsed timer. statusText flows from API through types to component. Build succeeds with no type errors.</done>
</task>

</tasks>

<verification>
- `npm run test:server` passes — classifier correctly hides all new tool output patterns
- `npm run build` succeeds — no TypeScript errors in client
- New patterns: `● Bash(...)`, `⎿ ...`, `… +N lines`, `✻`/`✶` status, `❯` prompt, JSON blocks all classified as hidden
- Working indicator appears at bottom of chat (above send box), not at top
- Projects API returns `statusText` field with live tmux status when working
</verification>

<success_criteria>
- Tool output lines no longer leak into chat messages
- Working indicator positioned like a typing indicator (bottom of chat)
- Status text from tmux visible in working indicator when available
- All existing tests still pass
</success_criteria>

<output>
After completion, create `.planning/quick/23-working-indicator-classifier-accuracy-im/23-SUMMARY.md`
</output>
