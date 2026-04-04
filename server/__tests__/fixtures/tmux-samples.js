'use strict';

/**
 * Real captured tmux output samples for each message type.
 * Used as ground truth for classifier tests.
 *
 * Some samples include ANSI escape codes to verify stripping works.
 */

const stageBannerSamples = [
  '## Phase 28: Schema + Classifier Foundation',
  'PLAN: Create classifier patterns',
  '=== Execution Wave 1 ===',
  '\x1b[1m## Phase 30: Chat UI Implementation\x1b[0m',
  'EXECUTE: Build chat message components',
  'RESEARCH: Investigate tmux capture formats',
  '## PLANNING COMPLETE',
  '## GAP CLOSURE: Missing auth middleware',
  'Wave 2: Parallel execution batch',
  '### Phase 29 Plan 01: Chat Components',
];

const checkpointSamples = [
  'YOUR ACTION: Review the changes and approve',
  'Checkpoint: Verify database migration succeeded',
  'VERIFY: Run npm test and confirm all pass',
  '\x1b[33mYOUR ACTION: Check the deployed URL\x1b[0m',
  'Checkpoint: Confirm the UI renders correctly',
];

const completionSamples = [
  'PHASE COMPLETE',
  'All plans executed successfully',
  'SUMMARY.md written to .planning/phases/28-schema-classifier-foundation/',
  '\x1b[32mPHASE COMPLETE\x1b[0m',
  'All tasks finished for phase 28',
];

const errorSamples = [
  'Error: ENOENT: no such file or directory, open \'/tmp/missing.js\'',
  'TypeError: Cannot read properties of undefined (reading \'length\')',
  'npm ERR! code ELIFECYCLE',
  'SyntaxError: Unexpected token }',
  'ReferenceError: foo is not defined',
  '\x1b[31mError: ECONNREFUSED 127.0.0.1:3000\x1b[0m',
  'EACCES: permission denied',
  'FATAL: database connection lost',
];

const hiddenToolCallSamples = [
  'Read(server/db.js)',
  'Write(server/gsd/classifier.js)',
  'Bash(npm run test:server)',
  'Grep(pattern, path)',
  'Glob(*.js)',
  'Edit(server/routes/api.js)',
  'WebSearch("tmux capture-pane format")',
  'WebFetch(https://example.com/docs)',
  'antml_invoke name="Read"',
  'antml_function_calls',
  'mcp__dashboard__list_sessions',
  'TodoWrite([{"task": "fix bug"}])',
];

const hiddenWorkingSamples = [
  '(3m 12s \xB7 \u2193 5.2k)',
  '(thinking)',
  '(12s \xB7 \u2193 1.8k)',
  '\x1b[90m(thinking)\x1b[0m',
  'Reading server/db.js',
  'Writing server/gsd/classifier.js',
  'Searching for pattern in codebase',
];

const hiddenCodeSamples = [
  '  1 | const x = 42;',
  '  15 | function foo() {',
  ' 102 | module.exports = { bar };',
  '\x1b[2m  7 | return null;\x1b[0m',
];

const hiddenToolOutputSamples = [
  '● Bash(npm run build)',
  '● Read(server/db.js)',
  '● Edit(src/app.tsx)',
  '● Skill(/gsd:quick)',
  '⎿  result text here',
  '⎿  Done (exit 0)',
  '… +42 lines (ctrl+o to expand)',
  '✻ Working… (1m 17s · ↓ 304 tokens · thought for 3s)',
  '✶ Cooked for 13m 35s',
  '❯ /gsd:quick fix the bug',
  '{ "path": "server/db.js" }',
];

const hiddenChromeSamples = [
  '\u25CF Update(.planning/PROJECT.md)',
  'Read 3 files (ctrl+o to expand)',
  'Listed 1 directory (ctrl+o to expand)',
  'Added 15 lines, removed 3 lines',
  '\u251C Stack research v4.1',
  '\u2514 Pitfalls research v4.1',
  'Enter to select \u00B7 up/down to navigate \u00B7 Esc to cancel',
  'How is Claude doing this session? (optional)',
  '1. [ ] Trust all tools',
  '2. [x] Selected option',
];

const gsdBannerSamples = [
  '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
  'GSD \u25BA RESEARCHING',
  'GSD \u25BA EXECUTING WAVE 1',
  'GSD \u25BA PHASE 33 COMPLETE \u2713',
  '\u25CF Step 7: Commit and Tag',
  '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557',
  '\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D',
  '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
];

const textSamples = [
  'I will now implement the classifier module.',
  'The function takes a raw line of tmux output and returns a typed object.',
  'This approach ensures backward compatibility with existing code.',
  'Let me explain the architecture decisions made here.',
  '\x1b[0mSome regular output with reset code\x1b[0m',
];

module.exports = {
  stageBannerSamples,
  checkpointSamples,
  completionSamples,
  errorSamples,
  hiddenToolCallSamples,
  hiddenToolOutputSamples,
  hiddenWorkingSamples,
  hiddenCodeSamples,
  hiddenChromeSamples,
  gsdBannerSamples,
  textSamples,
};
