'use strict';

const fs = require('fs');
const path = require('path');
const { isTmuxSessionActive } = require('./tmux');
const { readState } = require('./readers');

const VERIFY_TIMEOUT_MS = 30 * 60 * 1000;  // 30 minutes default
const POLL_INTERVAL_MS = 3_000;
const CIRCUIT_OPEN_THRESHOLD = 3;  // consecutive failures before halting

// Per-project in-memory guard — prevents concurrent verify runs
const _verifyingSet = new Set();

function isVerifying(projectName) {
  return _verifyingSet.has(projectName);
}

// For tests only — allows pre-seeding the verifying set
function _testSetVerifying(projectName) {
  _verifyingSet.add(projectName);
}
function _testClearVerifying(projectName) {
  _verifyingSet.delete(projectName);
}

function _sendKeysToTmux(sessionName, text) {
  const { execFileSync } = require('child_process');
  execFileSync('tmux', ['send-keys', '-t', sessionName, text, 'Enter'], { stdio: 'ignore', timeout: 5000 });
}

async function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Parse UAT.md from a project's .planning/phases/ directory.
 * Returns { status, issues, issuesSummary } or null if file not found.
 */
function _readUatStatus(root, phaseNum) {
  try {
    const phasesDir = path.join(root, '.planning', 'phases');
    const paddedPhase = String(phaseNum).padStart(2, '0');
    const entries = fs.readdirSync(phasesDir);
    const phaseDir = entries.find(d => d.startsWith(paddedPhase + '-'));
    if (!phaseDir) return null;

    const phaseFullDir = path.join(phasesDir, phaseDir);
    const files = fs.readdirSync(phaseFullDir);
    const uatFile = files.find(f => f.endsWith('-UAT.md'));
    if (!uatFile) return null;

    const raw = fs.readFileSync(path.join(phaseFullDir, uatFile), 'utf8');

    // Parse frontmatter between --- delimiters
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;
    const fm = fmMatch[1];

    const statusMatch = fm.match(/^status:\s*(.+)$/m);
    const issuesMatch = fm.match(/^issues:\s*(\d+)$/m);

    const status = statusMatch ? statusMatch[1].trim() : null;
    const issues = issuesMatch ? parseInt(issuesMatch[1], 10) : null;

    // Extract plain-English summary from ## Issues or ## Summary section
    let issuesSummary = '';
    const issuesSection = raw.match(/##\s+Issues?\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (issuesSection) {
      issuesSummary = issuesSection[1].trim().slice(0, 500); // cap at 500 chars
    }

    return { status, issues: issues ?? 0, issuesSummary };
  } catch {
    return null;
  }
}

/**
 * Read consecutive verify failures for a project from SQLite.
 * Returns 0 on any error.
 */
function _getVerifyFailures(projectId) {
  try {
    const { db } = require('../db');
    const row = db.prepare('SELECT consecutive_failures FROM project_verify_state WHERE project_id = ?').get(projectId);
    return row ? row.consecutive_failures : 0;
  } catch {
    return 0;
  }
}

function _recordVerifyFailure(projectId) {
  try {
    const { db } = require('../db');
    db.prepare(`
      INSERT INTO project_verify_state (project_id, consecutive_failures, last_verify_at)
      VALUES (?, 1, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        consecutive_failures = consecutive_failures + 1,
        last_verify_at = excluded.last_verify_at
    `).run(projectId, new Date().toISOString());
  } catch { /* never let DB error break verify flow */ }
}

function _resetVerifyFailures(projectId) {
  try {
    const { db } = require('../db');
    db.prepare(`
      INSERT INTO project_verify_state (project_id, consecutive_failures, last_verify_at)
      VALUES (?, 0, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        consecutive_failures = 0,
        last_verify_at = excluded.last_verify_at
    `).run(projectId, new Date().toISOString());
  } catch { /* never let DB error break verify flow */ }
}

/**
 * Extract phase number from STATE.md current_phase string.
 * "53 (auto-verify)" → 53; "53" → 53; "Phase 53" → 53; null → null.
 */
function _parsePhaseNum(currentPhase) {
  if (!currentPhase) return null;
  const m = String(currentPhase).match(/\b(\d+)\b/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Injectable test variant. All I/O goes through injected functions.
 * Real startVerify() calls this with production implementations.
 */
async function _testStartVerify(project, opts = {}, fns = {}) {
  const {
    isTmuxActiveFn = isTmuxSessionActive,
    sendKeysFn = _sendKeysToTmux,
    readUatStatusFn = _readUatStatus,
    broadcastFn,   // REQUIRED — callers must inject or the module will throw
    sleepFn = _sleep,
    getStateFn = readState,
    getVerifyFailuresFn = _getVerifyFailures,
    recordVerifyFailureFn = _recordVerifyFailure,
    resetVerifyFailuresFn = _resetVerifyFailures,
  } = fns;

  if (!broadcastFn) throw new Error('verifyOrchestrator._testStartVerify: broadcastFn is required');

  const { name, tmux_session, root } = project;

  // Guard: circuit open — too many consecutive failures
  const failCount = getVerifyFailuresFn(name);
  if (failCount >= CIRCUIT_OPEN_THRESHOLD) {
    return { ok: false, reason: 'circuit-open', consecutiveFailures: failCount };
  }

  // Guard: not already verifying
  if (_verifyingSet.has(name)) {
    return { ok: false, reason: 'already-verifying' };
  }

  // Guard: STATE.md must show status='executing' to confirm execute-phase just finished
  const state = getStateFn(root);
  if (!state || state.status !== 'executing') {
    return { ok: false, reason: 'not-executing', stateStatus: state?.status ?? null };
  }

  // Guard: tmux session must be alive
  if (!isTmuxActiveFn(tmux_session)) {
    return { ok: false, reason: 'session-inactive' };
  }

  const phaseNum = _parsePhaseNum(state.current_phase);

  // Enter verifying state
  _verifyingSet.add(name);
  broadcastFn('project_state_change', {
    project: name,
    sessionState: 'waiting',
    verifyState: 'verifying',
  });

  try {
    // Inject verify command into tmux
    sendKeysFn(tmux_session, `/gsd-verify-work${phaseNum ? ` ${phaseNum}` : ''}`);

    // Poll for UAT.md completion
    const deadline = Date.now() + (opts.timeout ?? VERIFY_TIMEOUT_MS);
    let uatResult = null;

    while (Date.now() < deadline) {
      await sleepFn(POLL_INTERVAL_MS);
      uatResult = readUatStatusFn(root, phaseNum);
      if (uatResult && uatResult.status === 'complete') break;
    }

    if (!uatResult || uatResult.status !== 'complete') {
      // Timeout
      recordVerifyFailureFn(name);
      broadcastFn('project_state_change', {
        project: name,
        sessionState: 'waiting',
        verifyState: 'verify-failed',
        verifyFailureSummary: 'Verification timed out before UAT.md was completed.',
      });
      return { ok: false, reason: 'timeout' };
    }

    const passed = uatResult.issues === 0;

    if (passed) {
      resetVerifyFailuresFn(name);
      broadcastFn('project_state_change', {
        project: name,
        sessionState: 'waiting',
        verifyState: 'verify-passed',
      });
    } else {
      recordVerifyFailureFn(name);
      broadcastFn('project_state_change', {
        project: name,
        sessionState: 'waiting',
        verifyState: 'verify-failed',
        verifyFailureSummary: uatResult.issuesSummary || `${uatResult.issues} issue(s) found during UAT.`,
      });
    }

    return { ok: true, passed, issues: uatResult.issues };

  } finally {
    _verifyingSet.delete(name);
  }
}

/**
 * Public API: start verify for a project.
 * broadcastFn must be passed — typically require('../websocket').broadcast.
 */
async function startVerify(project, broadcastFn, opts = {}) {
  return _testStartVerify(project, opts, { broadcastFn });
}

/**
 * runVerify: synchronous-feel wrapper for route handlers (pause, archive).
 * Identical to startVerify but more explicit for the route-handler call sites.
 */
async function runVerify(project, broadcastFn, opts = {}) {
  return _testStartVerify(project, opts, { broadcastFn });
}

/**
 * maybeStartVerify: fire-and-forget entry point for stateBroadcaster.
 * Never throws — all errors swallowed. Returns Promise<void>.
 */
async function maybeStartVerify(project, broadcastFn) {
  try {
    await startVerify(project, broadcastFn);
  } catch { /* never let verify crash the broadcaster */ }
}

module.exports = {
  startVerify,
  runVerify,
  maybeStartVerify,
  isVerifying,
  _testStartVerify,
  _testSetVerifying,
  _testClearVerifying,
};
