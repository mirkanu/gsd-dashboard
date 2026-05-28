'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

/**
 * Returns true if project has been in its current stage for daysThreshold+ days
 * AND the project root has commitsThreshold+ commits on HEAD.
 */
async function meetsNudgeCriteria(project, { daysThreshold = 14, commitsThreshold = 12 } = {}) {
  const stageUpdatedAt = project.stageUpdatedAt ? new Date(project.stageUpdatedAt) : null;
  if (!stageUpdatedAt) return false;

  const daysSince = (Date.now() - stageUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < daysThreshold) return false;

  if (!project.root) return false;

  try {
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
