'use strict';

const betterStackProvisioner = require('../betterStackProvisioner');
const r2Provisioner = require('../r2Provisioner');

const ALLOWED_TRANSITIONS = new Set([
  'draft->alpha', 'alpha->draft',
  'alpha->beta', 'beta->alpha',
  'beta->launched', 'launched->beta',
  'launched->maintenance', 'maintenance->launched',
  'draft->retired', 'alpha->retired', 'beta->retired', 'launched->retired', 'maintenance->retired',
  'retired->draft',
]);

function canTransition(from, to) {
  return ALLOWED_TRANSITIONS.has(`${from}->${to}`);
}

/**
 * Check all gates for a stage transition.
 * Returns { valid, hardGates, softGates, requiresProvisioning }
 * requiresProvisioning: array of gate names that failed but CAN be auto-provisioned
 */
async function validateGates(project, targetStage) {
  const from = project.stage || 'draft';
  if (!canTransition(from, targetStage)) {
    return {
      valid: false,
      blocked: true,
      reason: `Cannot transition from ${from} to ${targetStage}`,
      hardGates: [],
      softGates: [],
      requiresProvisioning: [],
    };
  }

  const transitionKey = `${from}->${targetStage}`;
  const hardGates = [];
  const softGates = [];
  const requiresProvisioning = [];

  if (transitionKey === 'beta->launched') {
    // Hard gate: production URL — must be present before launch
    if (!project.productionUrl) {
      hardGates.push({ gate: 'productionUrlSet', label: 'Production URL required to launch', pass: false });
    }

    // Hard gate: BetterStack monitor (auto-provisionable)
    const hasMonitor = await betterStackProvisioner.checkMonitor(project.name);
    if (!hasMonitor) {
      requiresProvisioning.push('betterStackMonitor');
    }

    // Hard gate: R2 bucket (auto-provisionable)
    const hasBucket = await r2Provisioner.checkBucket(project.name);
    if (!hasBucket) {
      requiresProvisioning.push('r2Bucket');
    }

    // Soft gate: GitHub Issues (advisory only — does not block)
    softGates.push({ gate: 'githubIssuesEnabled', label: 'GitHub Issues recommended for Launched stage', pass: true });
  }

  if (transitionKey === 'alpha->beta') {
    // Soft gate: preview URL — warns but never blocks (decision D-04)
    if (!project.previewUrl) {
      softGates.push({ gate: 'previewUrlSet', label: 'Preview URL: optional but recommended for Beta', pass: false });
    }
  }

  // valid = no hard gate failures
  const valid = hardGates.length === 0;
  return { valid, hardGates, softGates, requiresProvisioning };
}

module.exports = { validateGates, canTransition, ALLOWED_TRANSITIONS };
