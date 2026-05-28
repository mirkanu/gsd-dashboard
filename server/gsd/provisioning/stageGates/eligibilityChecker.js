'use strict';

// Use module reference (not destructured) so tests can monkey-patch childProcess.execFileSync
const childProcess = require('child_process');

/**
 * Returns true if project has been in its current stage for daysThreshold+ days
 * AND the project root has commitsThreshold+ commits on HEAD.
 */
function meetsNudgeCriteria(project, { daysThreshold = 14, commitsThreshold = 12 } = {}) {
  const stageUpdatedAt = project.stageUpdatedAt ? new Date(project.stageUpdatedAt) : null;
  if (!stageUpdatedAt) return false;

  const daysSince = (Date.now() - stageUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < daysThreshold) return false;

  if (!project.root) return false;

  try {
    const out = childProcess.execFileSync('git', ['-C', project.root, 'rev-list', '--count', 'HEAD'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const commitCount = parseInt(out.trim(), 10);
    return !isNaN(commitCount) && commitCount >= commitsThreshold;
  } catch {
    return false;
  }
}

module.exports = { meetsNudgeCriteria };
