'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const STACK_OPEN = '<!-- Stack (auto-managed by GSD Dashboard — do not edit manually) -->';
const STACK_CLOSE = '<!-- /Stack -->';

/**
 * Write or replace the ## Stack (auto-managed) section in a CLAUDE.md file.
 * Uses HTML comment anchors for idempotent replacement.
 * Falls back to appending if no markers present.
 *
 * SECURITY: claudeMdPath is derived from project.path (trusted internal config).
 * Section is a static markdown table — no user-controlled interpolation.
 *
 * @param {string} claudeMdPath  Absolute path to project's CLAUDE.md
 * @param {string} projectName   Used to derive env var names
 */
function injectStackSection(claudeMdPath, projectName) {
  if (!fs.existsSync(claudeMdPath)) {
    console.warn(`[claudeMdInjector] CLAUDE.md not found at ${claudeMdPath} — skipping`);
    return;
  }
  const now = new Date().toISOString();
  const umamiKey = `${projectName.toUpperCase()}_UMAMI_WEBSITE_ID`;
  const sentryKey = `${projectName.toUpperCase()}_SENTRY_DSN`;
  const bucketRef = `gsd-${projectName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const section = [
    STACK_OPEN,
    '## Stack (auto-managed)',
    '',
    '| Service | Key / Reference | Purpose |',
    '|---------|-----------------|---------|',
    `| Umami | \`${umamiKey}\` | Analytics (umami.gsdlabs.dev) |`,
    `| BetterStack | monitor: \`gsd-${projectName}\` | Uptime monitoring |`,
    `| Cloudflare R2 | bucket: \`${bucketRef}\` | Storage |`,
    `| Sentry | \`${sentryKey}\` | Error tracking (sentry.io) |`,
    '',
    `*Last updated: ${now} — updated automatically on each stage transition.*`,
    STACK_CLOSE,
  ].join('\n');

  let content = fs.readFileSync(claudeMdPath, 'utf8');
  const openIdx = content.indexOf(STACK_OPEN);
  const closeIdx = content.indexOf(STACK_CLOSE);

  if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
    // Replace existing section (idempotent)
    content = content.slice(0, openIdx) + section + content.slice(closeIdx + STACK_CLOSE.length);
  } else {
    // Append to end of file
    content = content.trimEnd() + '\n\n' + section + '\n';
  }

  const tmpPath = path.join(os.tmpdir(), `claude-md-${Date.now()}.tmp`);
  fs.writeFileSync(tmpPath, content, { encoding: 'utf8' });
  try {
    fs.renameSync(tmpPath, claudeMdPath);
  } catch (e) {
    if (e.code === 'EXDEV') {
      fs.copyFileSync(tmpPath, claudeMdPath);
      fs.unlinkSync(tmpPath);
    } else {
      try { fs.unlinkSync(tmpPath); } catch {}
      throw e;
    }
  }
}

module.exports = { injectStackSection, STACK_OPEN, STACK_CLOSE };
