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
 * Generate the universal CLAUDE.md content for a new project.
 *
 * Contains project-agnostic infrastructure rules that apply at every stage,
 * regardless of provisioning state. Project-specific credentials (API keys,
 * DSNs, website IDs) are NOT included here — those are injected by the
 * dashboard on stage transitions via the Stack section.
 *
 * @param {string} projectName - Sanitized project name
 * @returns {string} CLAUDE.md content
 */
function buildClaudeMd(projectName) {
  const umamiKey = `${projectName.toUpperCase()}_UMAMI_WEBSITE_ID`;
  const sentryKey = `${projectName.toUpperCase()}_SENTRY_DSN`;

  return [
    `# ${projectName} — Claude Code Working Guide`,
    '',
    '## Project mission',
    '',
    '_Define what this project is for in one sentence. This guides all planning and implementation decisions._',
    '',
    '## Non-negotiable engineering rules',
    '',
    '- Preserve existing behavior unless explicitly asked to change it.',
    '- Prefer minimal, reversible diffs.',
    '- Never silently weaken safety controls around destructive actions.',
    '- Keep docs updated when behavior, commands, file locations, or workflows change.',
    '',
    '## Stack',
    '',
    '> **Canonical reference:** `/home/services/.claude/shared-services.md`',
    '> Lists all services, the Telegram file-push API, and the secrets layout.',
    '> Read that file first when you need to access any shared service.',
    '',
    'This project runs on a shared Hetzner VPS. The following services are',
    'available at every stage — they are provisioned automatically as the',
    'project advances through stages.',
    '',
    '<!-- Stack (auto-managed by GSD Dashboard — do not edit manually) -->',
    '## Stack (auto-managed)',
    '',
    '| Service | Key / Reference | Purpose |',
    '|---------|-----------------|---------|',
    `| Umami | \`${umamiKey}\` | Analytics (umami.gsdlabs.dev) |`,
    '| BetterStack | monitor: \`gsd-{project}\` | Uptime monitoring |',
    '| Cloudflare R2 | bucket: \`gsd-{project}\` | Storage |',
    `| Sentry | \`${sentryKey}\` | Error tracking (sentry.io) |`,
    '| Telegram | \`POST http://localhost:4820/api/services/telegram/send-file\` | File push to owner\'s Telegram |',
    '',
    '*This section is auto-managed by the GSD Dashboard — do not edit manually.*',
    '<!-- /Stack -->',
    '',
    '### How the stack works',
    '',
    '- The table above is rewritten by the dashboard on every stage transition',
    '  to keep credentials current. Never edit it by hand.',
    '- If a service has no credentials yet, it has not been provisioned for',
    '  this project\'s stage. Provisioning happens automatically.',
    '- All secrets come from `/home/services/.env.production` on the VPS.',
    '  Never hardcode secrets in source files — reference the env var name.',
    '- There is no separate "Shared Services" section. Everything is "Stack".',
    '',
    '## Repo map',
    '',
    '_Document the main directories here as the project grows._',
  ].join('\n') + '\n';
}

/**
 * Scaffold a new blank GSD project directory.
 * Creates: README.md, .gitignore, CLAUDE.md
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

  // CLAUDE.md — universal infrastructure rules for every new project
  const claudeMd = buildClaudeMd(name);
  fs.writeFileSync(path.join(projectRoot, 'CLAUDE.md'), claudeMd, 'utf8');

  // Intentionally NO package.json — it would make init.cjs flag the project
  // as brownfield and prompt "detected existing code. Map codebase first?".
  // If the project ends up being Node, /gsd-new-project or the user adds one
  // explicitly (via `npm init`) based on the chosen stack.
}

module.exports = { scaffoldProject, sanitizeName, STEP_SEQUENCE };
