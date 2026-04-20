'use strict';

const fs = require('fs');
const path = require('path');

const STEP_SEQUENCE = [
  'scaffold',
  'git_init',
  'gsd_install',
  'github_create',
  'git_push',
  'tmux_start',
  'claude_launch',
];

/**
 * Sanitize a user-supplied project name to a safe folder/tmux session name.
 * Rules (per CONTEXT.md D-07): lowercase, ASCII-only, spaces→dashes,
 * strip disallowed chars, collapse dashes, trim leading/trailing dashes.
 */
function sanitizeName(input) {
  return (input || '')
    .toLowerCase()
    .replace(/[_]+/g, ' ')           // underscores → spaces (word separators)
    .replace(/[^a-z0-9\s-]/g, '')   // strip non-ASCII-safe chars
    .replace(/\s+/g, '-')            // spaces → dashes
    .replace(/-+/g, '-')             // collapse multiple dashes
    .replace(/^-+|-+$/g, '');        // trim leading/trailing dashes
}

/**
 * Scaffold a new blank GSD project directory.
 * Creates: README.md, .gitignore, package.json
 *
 * @param {string} projectRoot - Absolute path where the project will be created
 * @param {{ name: string, description?: string }} opts
 * @throws if projectRoot already exists
 */
function scaffoldProject(projectRoot, { name, description = '' }) {
  // Fail fast if directory already exists — avoid partial overwrites
  if (fs.existsSync(projectRoot)) {
    throw new Error(`Directory already exists: ${projectRoot}`);
  }

  fs.mkdirSync(projectRoot, { recursive: true });

  // README.md
  const readme = `# ${name}\n\n${description || 'A new GSD project.'}\n`;
  fs.writeFileSync(path.join(projectRoot, 'README.md'), readme, 'utf8');

  // .gitignore — node_modules, .env, OS artifacts, GSD worktrees
  const gitignore = [
    'node_modules/',
    '.env',
    '.env.local',
    '.env.*.local',
    '.planning/worktrees',
    '.planning/phase-cache',
    '*.swp',
    '*.swo',
    '.DS_Store',
    'Thumbs.db',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(projectRoot, '.gitignore'), gitignore, 'utf8');

  // package.json — minimal, private
  const pkg = {
    name: sanitizeName(name),
    version: '0.1.0',
    description: description || '',
    private: true,
  };
  fs.writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n',
    'utf8',
  );
}

module.exports = { scaffoldProject, sanitizeName, STEP_SEQUENCE };
