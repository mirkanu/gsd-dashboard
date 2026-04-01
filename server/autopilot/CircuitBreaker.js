'use strict';

/**
 * CircuitBreaker — halts an autopilot run after N consecutive failures on the same phase.
 *
 * Failure count is persisted in autopilot_runs.failure_count (survives server restarts).
 * Three failures on the same phase triggers the circuit open state.
 *
 * Usage:
 *   const cb = new CircuitBreaker(runId);
 *   if (cb.isOpen()) { halt(); }
 *   const shouldHalt = cb.recordFailure(phaseNum);
 *   if (shouldHalt) { halt(); }
 *   cb.reset(); // When user resumes — resets failure counter
 */
class CircuitBreaker {
  /**
   * @param {string} runId - ID from autopilot_runs table
   * @param {number} failureThreshold - Failures before circuit opens (default: 3)
   * @param {object|null} db - better-sqlite3 Database instance (injected for testing)
   */
  constructor(runId, failureThreshold = 3, db = null) {
    this.runId = runId;
    this.failureThreshold = failureThreshold;
    this._db = db || require('../db').db;
  }

  /**
   * Record a phase failure. Returns true if circuit should now open (caller should halt).
   * @param {number} phaseNum - phase number that failed
   * @returns {boolean} true if failure count has reached threshold
   */
  recordFailure(phaseNum) {
    const run = this._db
      .prepare('SELECT failure_count FROM autopilot_runs WHERE id = ?')
      .get(this.runId);
    if (!run) throw new Error(`Autopilot run not found: ${this.runId}`);

    const newCount = (run.failure_count || 0) + 1;
    this._db
      .prepare('UPDATE autopilot_runs SET failure_count = ?, last_failed_phase_num = ? WHERE id = ?')
      .run(newCount, phaseNum, this.runId);
    return newCount >= this.failureThreshold;
  }

  /**
   * Returns true if the circuit is open (failure count has reached threshold).
   * @returns {boolean}
   */
  isOpen() {
    const run = this._db
      .prepare('SELECT failure_count FROM autopilot_runs WHERE id = ?')
      .get(this.runId);
    return run ? (run.failure_count || 0) >= this.failureThreshold : false;
  }

  /**
   * Reset failure counter. Call when user manually resumes a paused run.
   */
  reset() {
    this._db
      .prepare('UPDATE autopilot_runs SET failure_count = 0, pause_reason = NULL WHERE id = ?')
      .run(this.runId);
  }
}

module.exports = { CircuitBreaker };
