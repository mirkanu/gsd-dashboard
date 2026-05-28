'use strict';
const { describe, it, mock, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('stage-nudges', () => {
  it('MAT-07: meetsNudgeCriteria returns false when project stage was updated recently', async () => {
    const { meetsNudgeCriteria } = require('../gsd/provisioning/stageGates/eligibilityChecker');
    const project = {
      name: 'new-proj',
      root: '/tmp/new-proj',
      stage: 'beta',
      stageUpdatedAt: new Date().toISOString(), // just now
    };
    const result = await meetsNudgeCriteria(project);
    assert.equal(result, false, 'Should not nudge a newly transitioned project');
  });

  it('MAT-07: meetsNudgeCriteria returns true when 14+ days and 12+ commits (mocked git)', async () => {
    // Mock child_process.execFile at module level
    const cp = require('child_process');
    const original = cp.execFile;
    cp.execFile = (_cmd, _args, _opts, cb) => {
      if (typeof _opts === 'function') { cb = _opts; }
      cb(null, { stdout: '15\n', stderr: '' });
    };
    try {
      // Re-require to pick up fresh module state (cache already loaded; mock is at runtime level)
      const { meetsNudgeCriteria } = require('../gsd/provisioning/stageGates/eligibilityChecker');
      const stageUpdatedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const project = { name: 'ready-proj', root: '/tmp/ready-proj', stage: 'beta', stageUpdatedAt };
      const result = await meetsNudgeCriteria(project);
      assert.equal(result, true, 'Should nudge when criteria met');
    } finally {
      cp.execFile = original;
    }
  });

  it('MAT-07: meetsNudgeCriteria returns false when commit count below threshold (mocked git)', async () => {
    const cp = require('child_process');
    const original = cp.execFile;
    cp.execFile = (_cmd, _args, _opts, cb) => {
      if (typeof _opts === 'function') { cb = _opts; }
      cb(null, { stdout: '5\n', stderr: '' });
    };
    try {
      const { meetsNudgeCriteria } = require('../gsd/provisioning/stageGates/eligibilityChecker');
      const stageUpdatedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const project = { name: 'few-commits', root: '/tmp/few-commits', stage: 'beta', stageUpdatedAt };
      const result = await meetsNudgeCriteria(project);
      assert.equal(result, false, 'Should not nudge when fewer than 12 commits');
    } finally {
      cp.execFile = original;
    }
  });
});
