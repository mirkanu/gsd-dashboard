'use strict';

const { promisify } = require('util');

/**
 * Returns true if project has been in its current stage for daysThreshold+ days
 * AND the project root has commitsThreshold+ commits on HEAD.
 *
 * Uses late-bound require('child_process').execFile so tests can stub it via
 * monkey-patching the child_process module object.
 */
async function meetsNudgeCriteria(project, { daysThreshold = 14, commitsThreshold = 12 } = {}) {
  const stageUpdatedAt = project.stageUpdatedAt ? new Date(project.stageUpdatedAt) : null;
  if (!stageUpdatedAt) return false;

  const daysSince = (Date.now() - stageUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < daysThreshold) return false;

  if (!project.root) return false;

  try {
    // Late-bind execFile so test stubs applied to require('child_process').execFile are picked up
    const execFileAsync = promisify(require('child_process').execFile);
    const { stdout } = await execFileAsync('git', ['-C', project.root, 'rev-list', '--count', 'HEAD'], {
      timeout: 5000,
    });
    const commitCount = parseInt(stdout.trim(), 10);
    return !isNaN(commitCount) && commitCount >= commitsThreshold;
  } catch {
    return false;
  }
}

module.exports = { meetsNudgeCriteria };
