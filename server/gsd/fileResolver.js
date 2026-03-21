/**
 * GSD planning file resolver.
 * Maps fileId strings to absolute file paths on disk.
 * Handles dynamic resolution of 'plan' from STATE.md.
 */

const fs = require('fs');
const path = require('path');
const { readState } = require('./readers');

const STATIC_MAPPINGS = {
  state: '.planning/STATE.md',
  roadmap: '.planning/ROADMAP.md',
  requirements: '.planning/REQUIREMENTS.md',
};

const VALID_IDS = new Set(['state', 'roadmap', 'requirements', 'plan']);

/**
 * Resolves a fileId to an absolute path within a project root.
 *
 * @param {string} _projectName - project name (unused but kept for symmetry with callers)
 * @param {string} root - absolute path to the project root directory
 * @param {string} fileId - one of: state, roadmap, requirements, plan
 * @returns {string|null} absolute file path, or null if unresolvable
 */
function resolveFile(_projectName, root, fileId) {
  try {
    if (!VALID_IDS.has(fileId)) {
      return null;
    }

    if (fileId !== 'plan') {
      return path.join(root, STATIC_MAPPINGS[fileId]);
    }

    // Resolve active PLAN.md dynamically from STATE.md
    const state = readState(root);
    if (!state || !state.current_phase) {
      return null;
    }

    const phaseNum = parseInt(state.current_phase, 10);
    if (isNaN(phaseNum)) {
      return null;
    }

    const padded = String(phaseNum).padStart(2, '0');
    const phasesDir = path.join(root, '.planning', 'phases');
    const entries = fs.readdirSync(phasesDir);
    const matchedEntry = entries.find((e) => new RegExp(`^${padded}-`).test(e));
    if (!matchedEntry) {
      return null;
    }

    const phaseDir = path.join(phasesDir, matchedEntry);
    const phaseFiles = fs.readdirSync(phaseDir);

    const planFiles = phaseFiles
      .filter((f) => /-PLAN\.md$/.test(f))
      .sort();

    if (planFiles.length === 0) {
      return null;
    }

    // Find first PLAN.md without a corresponding SUMMARY.md (that's the active one)
    const activePlan = planFiles.find((planFile) => {
      const summaryFile = planFile.replace('-PLAN.md', '-SUMMARY.md');
      return !phaseFiles.includes(summaryFile);
    });

    // If all plans have summaries, phase is done — return the last PLAN.md
    const chosen = activePlan || planFiles[planFiles.length - 1];
    return path.join(phaseDir, chosen);
  } catch {
    return null;
  }
}

module.exports = { resolveFile };
