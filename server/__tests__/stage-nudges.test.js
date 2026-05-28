'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

// Stub execFileSync so no real git calls happen
const childProcess = require('child_process');

describe('stage-nudges', () => {
  it('MAT-07: meetsNudgeCriteria returns false when project stage was updated recently', () => {
    const { meetsNudgeCriteria } = require('../gsd/provisioning/stageGates/eligibilityChecker');
    const project = {
      name: 'new-proj',
      root: '/tmp/new-proj',
      stage: 'beta',
      stageUpdatedAt: new Date().toISOString(), // just now
    };
    const result = meetsNudgeCriteria(project);
    assert.equal(result, false, 'Should not nudge a newly transitioned project');
  });

  it('MAT-07: meetsNudgeCriteria returns true when 14+ days and 12+ commits (mocked git)', () => {
    // Mock execFileSync to return commit count
    const original = childProcess.execFileSync;
    childProcess.execFileSync = () => '15\n';
    try {
      const { meetsNudgeCriteria } = require('../gsd/provisioning/stageGates/eligibilityChecker');
      const stageUpdatedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const project = { name: 'ready-proj', root: '/tmp/ready-proj', stage: 'beta', stageUpdatedAt };
      const result = meetsNudgeCriteria(project);
      assert.equal(result, true, 'Should nudge when criteria met');
    } finally {
      childProcess.execFileSync = original;
    }
  });

  it('MAT-07: meetsNudgeCriteria returns false when commit count below threshold (mocked git)', () => {
    const original = childProcess.execFileSync;
    childProcess.execFileSync = () => '5\n';
    try {
      const { meetsNudgeCriteria } = require('../gsd/provisioning/stageGates/eligibilityChecker');
      const stageUpdatedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const project = { name: 'few-commits', root: '/tmp/few-commits', stage: 'beta', stageUpdatedAt };
      const result = meetsNudgeCriteria(project);
      assert.equal(result, false, 'Should not nudge when fewer than 12 commits');
    } finally {
      childProcess.execFileSync = original;
    }
  });
});
