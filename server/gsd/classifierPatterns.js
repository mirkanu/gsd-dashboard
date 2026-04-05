'use strict';

const stripAnsi = require('strip-ansi');

/**
 * Message type constants for classified tmux output.
 */
const MESSAGE_TYPES = {
  STAGE_BANNER: 'stage_banner',
  NEXT_UP: 'next_up',
  CHECKPOINT: 'checkpoint',
  COMPLETION: 'completion',
  ERROR: 'error',
  HIDDEN: 'hidden',
  TEXT: 'text',
};

/**
 * Priority-ordered pattern groups. First match wins.
 * Order: hidden tool calls > hidden code > stage banners > errors > completions > checkpoints > hidden working
 */
const PATTERNS = [
  // Hidden: tool calls (highest priority)
  {
    type: MESSAGE_TYPES.HIDDEN,
    patterns: [
      /^(?:Read|Write|Edit|Bash|Grep|Glob|WebSearch|WebFetch|TodoWrite|Search|Agent)\(/,
      /^(?:mcp__|antml_)/,
    ],
  },
  // Hidden: bullet tool calls (● prefix)
  {
    type: MESSAGE_TYPES.HIDDEN,
    patterns: [
      /^●\s+(?:Bash|Read|Write|Edit|Grep|Glob|WebSearch|WebFetch|TodoWrite|Search|Agent|Skill|Update)\(/,
    ],
  },
  // Hidden: continuation lines, collapsed markers, status lines, user prompt echo, JSON results
  {
    type: MESSAGE_TYPES.HIDDEN,
    patterns: [
      /^⎿/,                    // tool result continuation marker
      /^…\s*\+\d+\s+lines/,   // collapsed output indicator
      /^[✻✶]/,                // working/completion status indicators
      /^❯/,                    // user input echo in tmux
      /^\{[\s"]/,              // opening brace of JSON tool results
    ],
  },
  // Hidden: collapsed summaries, chrome, selection UI, feedback prompts
  {
    type: MESSAGE_TYPES.HIDDEN,
    patterns: [
      /^Read \d+ files?\s/,              // Read 3 files (ctrl+o to expand)
      /^Listed \d+ director/,            // Listed 1 directory (ctrl+o to expand)
      /^Added \d+ lines/,               // Added 15 lines, removed 3 lines
      /^[\u251C\u2514]/,               // Background task tree lines (├ └)
      /^Enter to select/,               // Selection UI navigation hint
      /How is Claude doing/,            // Session feedback prompt
      /ctrl\+o to expand/,              // Any collapsed output with ctrl+o hint
      /^\s*\d+\.\s*\[[ x]\]/,          // Numbered checkbox items: 1. [ ] Option
    ],
  },
  // Hidden: numbered code output lines
  {
    type: MESSAGE_TYPES.HIDDEN,
    patterns: [
      /^\s*\d+\s*\|/,
    ],
  },
  // Stage banners
  {
    type: MESSAGE_TYPES.STAGE_BANNER,
    patterns: [
      /^#{1,3}\s+Phase\s+\d+/i,
      /^#{1,3}\s+(?:PLANNING COMPLETE|GAP CLOSURE)/,
      /^(?:PLAN|EXECUTE|RESEARCH):/i,
      /^={3,}\s+/,
      /^Wave\s+\d+:/i,
      /^[\u2501]{10,}$/,                    // Heavy horizontal rule line (━━━━━━━━━)
      /GSD\s*[\u25BA\u25B6]\s*\w/,          // GSD ► RESEARCHING (banner text line)
      /^●\s*Step\s+\d+/,                    // ● Step 7: Commit and Tag
      /^[\u2554\u255A\u2557\u255D\u2551\u2550]{2,}/,  // Checkpoint/error box borders
      /^[\u2500]{10,}$/,                     // Light horizontal rule (Next Up separator)
    ],
  },
  // Next Up: GSD command suggestions and related blocks
  {
    type: MESSAGE_TYPES.NEXT_UP,
    patterns: [
      /^[►▶]\s*Next\s/i,                    // triangle-right Next Up header line
      /^\*\*Also available:\*\*/,            // Also available block header
      /\/clear\s+first/,                     // Clear reminder line
      /^(?:Execute|Plan|Research|Verify|Quick):\s*`\/gsd:/,  // GSD command suggestion lines
      /`\/gsd:\S+`/,                         // Any backtick-wrapped /gsd: command
      /^[-•]\s*`\/gsd:/,                     // Bullet list items with /gsd commands
    ],
  },
  // Errors
  {
    type: MESSAGE_TYPES.ERROR,
    patterns: [
      /^(?:Error|ERROR|FAILED|TypeError|SyntaxError|ReferenceError|FATAL):/,
      /^npm ERR!/,
      /^(?:ENOENT|EACCES|ECONNREFUSED)/,
      /^Unhandled/,
    ],
  },
  // Completions
  {
    type: MESSAGE_TYPES.COMPLETION,
    patterns: [
      /PHASE COMPLETE/i,
      /All (?:plans|tasks) (?:executed|finished|complete)/i,
      /SUMMARY\.md written/i,
    ],
  },
  // Checkpoints
  {
    type: MESSAGE_TYPES.CHECKPOINT,
    patterns: [
      /YOUR ACTION:/i,
      /^Checkpoint:/i,
      /^VERIFY:/i,
    ],
  },
  // Hidden: working/thinking (lowest priority among hidden)
  {
    type: MESSAGE_TYPES.HIDDEN,
    patterns: [
      /\(\s*\d+[hms].*?\xB7.*?\u2193/,
      /\(\s*thinking\s*\)/,
      /^\s*Reading\s+/,
      /^\s*Writing\s+/,
      /^\s*Searching\s+/,
    ],
  },
];

/**
 * Classify a single line of raw tmux output.
 *
 * @param {string} rawLine - Raw line possibly containing ANSI codes
 * @returns {{ msg_type: string, content: string, metadata: null } | null}
 *   null if line is empty/whitespace after stripping
 */
function classifyLine(rawLine) {
  const clean = stripAnsi(rawLine).trim();
  if (!clean) return null;

  for (const group of PATTERNS) {
    for (const pattern of group.patterns) {
      if (pattern.test(clean)) {
        return { msg_type: group.type, content: clean, metadata: null };
      }
    }
  }

  return { msg_type: MESSAGE_TYPES.TEXT, content: clean, metadata: null };
}

/**
 * Classify a multi-line chunk of raw tmux output.
 *
 * @param {string} rawText - Raw multi-line text
 * @returns {Array<{ msg_type: string, content: string, metadata: null }>}
 */
function classifyChunks(rawText) {
  return rawText
    .split('\n')
    .map(classifyLine)
    .filter(Boolean);
}

module.exports = {
  MESSAGE_TYPES,
  PATTERNS,
  classifyLine,
  classifyChunks,
};
