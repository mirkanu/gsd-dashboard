#!/usr/bin/env node

/**
 * Idempotent installer for the current GSD Dashboard Claude Code hook set.
 * Merges entries into .claude/settings.json — never overwrites user customisations.
 *
 * Hook set installed (mirrors the live .claude/settings.json at time of write):
 *   SessionStart: gsd-check-update.js, gsd-session-state.sh
 *   PostToolUse:  gsd-context-monitor.js, gsd-phase-boundary.sh, gsd-busy-marker.js (Bash|Agent|Task)
 *   PreToolUse:   gsd-prompt-guard.js, gsd-read-guard.js, gsd-workflow-guard.js, gsd-validate-commit.sh, gsd-busy-marker.js (Bash|Agent|Task)
 *   SubagentStop: gsd-busy-marker.js
 *   Stop:         gsd-busy-marker.js
 *   statusLine:   gsd-statusline.js
 *
 * Future Phase 54B notification-event hooks will be added to the MANAGED_HOOKS
 * table below when shipped — DO NOT add tmux-side Telegram hooks here (see CLN-03).
 */

const fs = require("fs");
const path = require("path");

const PROJECT_DIR = path.resolve(__dirname, "..");
const SETTINGS_PATH = path.join(PROJECT_DIR, ".claude", "settings.json");

// Source of truth for the hook set this project owns. Array of { event, matcher?, command, type?, timeout? }.
const MANAGED_HOOKS = [
  // SessionStart (no matcher — runs for every session start)
  { event: "SessionStart", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-check-update.js' },
  { event: "SessionStart", command: 'bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-session-state.sh' },
  // PostToolUse
  { event: "PostToolUse", matcher: "Bash|Edit|Write|MultiEdit|Agent|Task", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-context-monitor.js', timeout: 10 },
  { event: "PostToolUse", matcher: "Write|Edit", command: 'bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-phase-boundary.sh', timeout: 5 },
  { event: "PostToolUse", matcher: "Bash", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-busy-marker.js', timeout: 5 },
  { event: "PostToolUse", matcher: "Agent|Task", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-busy-marker.js', timeout: 5 },
  // PreToolUse
  { event: "PreToolUse", matcher: "Write|Edit", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-prompt-guard.js', timeout: 5 },
  { event: "PreToolUse", matcher: "Write|Edit", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-read-guard.js', timeout: 5 },
  { event: "PreToolUse", matcher: "Write|Edit", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-workflow-guard.js', timeout: 5 },
  { event: "PreToolUse", matcher: "Bash", command: 'bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-validate-commit.sh', timeout: 5 },
  { event: "PreToolUse", matcher: "Bash", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-busy-marker.js', timeout: 5 },
  { event: "PreToolUse", matcher: "Agent|Task", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-busy-marker.js', timeout: 5 },
  // SubagentStop + Stop
  { event: "SubagentStop", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-busy-marker.js', timeout: 5 },
  { event: "Stop", command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-busy-marker.js', timeout: 5 },
];

const MANAGED_STATUSLINE = {
  type: "command",
  command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/gsd-statusline.js'
};

function readSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")); }
  catch { return {}; }
}

function sameHookEntry(a, b) {
  return a.type === (b.type || "command") && a.command === b.command && (a.timeout || null) === (b.timeout || null);
}

function ensureHook(settings, entry) {
  settings.hooks = settings.hooks || {};
  settings.hooks[entry.event] = settings.hooks[entry.event] || [];
  const newHook = { type: entry.type || "command", command: entry.command };
  if (entry.timeout) newHook.timeout = entry.timeout;

  // Check if this exact hook already exists anywhere in this event (across all matcher groups)
  const hookAlreadyExists = settings.hooks[entry.event].some(group => {
    return (group.hooks || []).some(h => sameHookEntry(h, newHook));
  });
  if (hookAlreadyExists) return;

  // Find or create appropriate matcher group
  let group;
  if (entry.matcher) {
    group = settings.hooks[entry.event].find(g => g.matcher === entry.matcher);
    if (!group) { group = { matcher: entry.matcher, hooks: [] }; settings.hooks[entry.event].push(group); }
  } else {
    // For no-matcher hooks, find first matcher-less group
    group = settings.hooks[entry.event].find(g => !g.matcher);
    if (!group) { group = { hooks: [] }; settings.hooks[entry.event].push(group); }
  }
  group.hooks = group.hooks || [];
  group.hooks.push(newHook);
}

function installHooks(silent = false) {
  const settings = readSettings();
  for (const entry of MANAGED_HOOKS) ensureHook(settings, entry);
  // statusLine: overwrite if ours, or set if absent
  if (!settings.statusLine || settings.statusLine.command !== MANAGED_STATUSLINE.command) {
    settings.statusLine = MANAGED_STATUSLINE;
  }
  // Ensure .claude dir exists
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
  if (!silent) console.log("Installed GSD Dashboard Claude Code hooks into .claude/settings.json");
}

if (require.main === module) installHooks(false);

module.exports = { installHooks, MANAGED_HOOKS, MANAGED_STATUSLINE };
