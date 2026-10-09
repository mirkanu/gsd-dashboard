#!/usr/bin/env node

/**
 * Hook installer — DISABLED on Zo (see issue #2, PR gsd/zo-mode-flag).
 *
 * Originally installed GSD Dashboard Claude Code hooks into the project's
 * `.claude/settings.json`. On Zo the dashboard never writes to the host's
 * `~/.claude/settings.json` — that file is read-only host state and the
 * dashboard server is not the right place to mutate global Claude Code
 * configuration. Hook installation on Zo is now a host-level one-shot, run
 * once when the dashboard is first set up (see Z1 in issue #2).
 *
 * The export surface is preserved so `server/routes/settings.js#reinstall-hooks`
 * and the `installHooks(...)` programmatic caller continue to compile. The HTTP
 * route has been updated to short-circuit to a no-op success (see P1).
 */

'use strict';

const MANAGED_HOOKS = Object.freeze({
  // Stable shape — kept so callers that reflect on the registry don't break.
  // No actual mutation occurs in ZO_MODE.
  'SessionStart': ['gsd-check-update'],
  'UserPromptSubmit': ['gsd-busy-marker'],
  'PreToolUse': ['gsd-busy-marker', 'gsd-task-graph'],
  'PostToolUse': ['gsd-busy-marker'],
  'Stop': ['gsd-busy-marker'],
  'Notification': ['gsd-busy-marker'],
});
const MANAGED_STATUSLINE = null;

function installHooks(_silent) {
  // Intentionally a no-op. Zo-mode hooks live outside this process — see issue #2.
  if (!_silent) {
    console.log(
      '[install-hooks] no-op on Zo. Hooks are installed host-side ' +
        '(see gsd-dashboard issue #2, step Z1).'
    );
  }
  return true;
}

if (require.main === module) {
  // CLI exit 0 — preserve the `npm run install-hooks` command so existing
  // automation doesn't break, but it no longer mutates any files.
  installHooks(false);
  process.exit(0);
}

module.exports = { installHooks, MANAGED_HOOKS, MANAGED_STATUSLINE };
