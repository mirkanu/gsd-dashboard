'use strict';

/**
 * Centralised filesystem paths for gsd-dashboard.
 *
 * Resolves the absolute path to the .env file edited by /api/env, plus the
 * supporting state directories. All Hetzner-VPS absolute paths (legacy) and
 * Zo Computer absolute paths (current) are sourced from environment
 * variables, falling back to the Zo defaults.
 *
 *   GSD_ENV_FILE     path edited by /api/env (default: <repo>/.env, which
 *                    is the file server/index.js loads at boot)
 *   GSD_PROJECTS_DIR root for Claude session dirs (default: /home/workspace/.gsd-dashboard/projects)
 *   GSD_DATA_DIR     uploads + scratch (default: <repo>)
 */

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..'); // server/lib -> repo root

const paths = {
  repo: REPO_ROOT,
  /** Environment file edited by the Env page. Override with GSD_ENV_FILE. */
  envFile: process.env.GSD_ENV_FILE || path.join(REPO_ROOT, '.env'),
  /** Where GSD projects live (Claude session dirs, .planning/, code). */
  projects: process.env.GSD_PROJECTS_DIR || '/home/workspace/.gsd-dashboard/projects',
  /** SQLite + other runtime data. */
  data: process.env.GSD_DATA_DIR || path.join(REPO_ROOT, 'data'),
  /** Server logs. */
  logs: path.join(REPO_ROOT, 'logs'),
  /** Maintenance scripts (memory-guard, prune, tmux-save). */
  scripts: path.join(REPO_ROOT, 'scripts'),
  /** Project-scoped uploads from the UI. */
  uploads: process.env.GSD_UPLOADS_DIR || path.join(REPO_ROOT, 'uploads'),
};

module.exports = paths;
