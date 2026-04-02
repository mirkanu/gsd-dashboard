'use strict';

const { v4: uuidv4 } = require('uuid');
const { CircuitBreaker } = require('./CircuitBreaker');

/**
 * AutopilotManager — drives the autonomous plan→execute loop for a GSD project.
 *
 * Polls STATE.md via readStateFn to detect phase completion, chains phases
 * sequentially, handles pause/resume, and applies failure learning (retry with
 * adjusted prompt) before invoking the CircuitBreaker.
 *
 * Usage:
 *   const m = new AutopilotManager({ db, spawnFn, broadcastFn, readStateFn });
 *   const { runId } = await m.start('my-project', { startPhase: 1, totalPhases: 5 });
 *   m.pause();
 *   m.resume();
 *   m.stop();
 */
class AutopilotManager {
  /**
   * @param {object} options
   * @param {object|null}   options.db                    - better-sqlite3 instance (injectable for tests)
   * @param {Function|null} options.spawnFn               - injectable spawnGsdCommand (default: production)
   * @param {Function|null} options.broadcastFn           - injectable broadcast (default: production)
   * @param {Function|null} options.readStateFn           - injectable readState(root) (default: production)
   * @param {number}        [options.pollMs=5000]         - polling interval in ms
   * @param {number}        [options.maxPhaseMs=1800000]  - max phase duration before treating as failure (30min)
   * @param {Function|null} [options.circuitBreakerFactory] - injectable CB factory for testing
   */
  constructor(options = {}) {
    this._db = options.db || require('../db').db;
    this._spawnFn = options.spawnFn || require('./processSpawner').spawnGsdCommand;
    this._broadcastFn = options.broadcastFn || require('../websocket').broadcast;
    this._readStateFn = options.readStateFn || require('../gsd/readers').readState;
    this._pollMs = options.pollMs || 5000;
    this._maxPhaseMs = options.maxPhaseMs || 30 * 60 * 1000;
    this._circuitBreakerFactory = options.circuitBreakerFactory || null;

    /** @type {boolean} */
    this.paused = false;
    /** @type {boolean} */
    this._stopped = false;
    /** @type {string|null} */
    this._runId = null;
    /** @type {string|null} */
    this._projectName = null;
    /** @type {string|null} */
    this._projectRoot = null;
    /** @type {NodeJS.Timeout|null} */
    this._interval = null;
    /** @type {object|null} */
    this._cb = null;

    // Internal state for loop tracking
    this._currentPhase = 1;
    this._totalPhases = 1;
    this._phaseStartedAt = null;
    this._phaseSpawned = false;
    this._retryAttempted = false;
    this._failureRecorded = false;
    this._baselineCompleted = null;
    this._pendingConfirmation = false;
    this._pendingCommand = null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start the autonomous loop for a project.
   * Inserts an autopilot_runs row and begins polling.
   *
   * @param {string} projectName - project name matching gsd-projects.json
   * @param {object} opts
   * @param {number} [opts.startPhase=1]     - phase number to start from
   * @param {number} [opts.totalPhases=1]    - total number of phases to run
   * @param {string} [opts.projectRoot=null] - root dir for readState calls
   * @returns {Promise<{ runId: string }>}
   */
  async start(projectName, opts = {}) {
    const startPhase = opts.startPhase || 1;
    const totalPhases = opts.totalPhases || 1;
    const projectRoot = opts.projectRoot || null;

    const runId = uuidv4();
    const startedAt = new Date().toISOString();

    this._db
      .prepare('INSERT INTO autopilot_runs (id, project_id, started_at, status) VALUES (?, ?, ?, ?)')
      .run(runId, projectName, startedAt, 'running');

    this._runId = runId;
    this._projectName = projectName;
    this._projectRoot = projectRoot;
    this._currentPhase = startPhase;
    this._totalPhases = totalPhases;
    this.paused = false;
    this._stopped = false;

    // Create CircuitBreaker for this run
    if (this._circuitBreakerFactory) {
      this._cb = this._circuitBreakerFactory(runId, 3, this._db);
    } else {
      this._cb = new CircuitBreaker(runId, 3, this._db);
    }

    // Get baseline completed_phases before starting
    const initialState = this._readStateFn(projectRoot);
    this._baselineCompleted = initialState?.progress?.completed_phases ?? 0;
    this._phaseSpawned = false;
    this._retryAttempted = false;
    this._failureRecorded = false;
    this._phaseStartedAt = Date.now();

    // Start poll loop
    this._interval = setInterval(() => this._tick(), this._pollMs);

    return { runId };
  }

  /**
   * Pause the loop at the next safe point (next poll tick).
   * Updates the DB status to 'paused'.
   */
  pause() {
    this.paused = true;
    if (this._runId) {
      this._db
        .prepare("UPDATE autopilot_runs SET status = 'paused' WHERE id = ?")
        .run(this._runId);
    }
  }

  /**
   * Resume a paused loop. Calls CircuitBreaker.reset() and resumes polling.
   */
  resume() {
    if (this._cb) {
      this._cb.reset();
    }
    this.paused = false;
    // Reset retry state so the current phase gets a fresh attempt
    this._retryAttempted = false;
    // Reset pending confirmation so a new confirmation can be issued
    this._pendingConfirmation = false;
    this._pendingCommand = null;
  }

  /**
   * Confirm a pending phase spawn. Called by POST /api/autopilot/confirm.
   * Clears the pending_confirmation state and triggers the actual spawn.
   * If waitForIdle times out (5 minutes), broadcasts queue_timeout and halts.
   */
  confirmSpawn() {
    if (!this._pendingConfirmation) return; // idempotent
    this._pendingConfirmation = false;
    const phaseNum = this._pendingCommand?.phaseNum;
    this._pendingCommand = null;

    // Broadcast queued status — session may still be busy
    this._broadcastFn('autopilot_progress', {
      projectName: this._projectName,
      phaseNum,
      status: 'queued',
      runId: this._runId,
    });

    this._doSpawn(phaseNum);
  }

  /**
   * Return the current run state for status endpoint queries.
   * @returns {{ runId: string|null, status: string, currentPhaseNum: number|null, projectName: string|null, startedAt: string|null }}
   */
  getStatus() {
    if (!this._runId) {
      return { runId: null, status: 'idle', currentPhaseNum: null, projectName: this._projectName, startedAt: null };
    }
    // Read current status from DB for accuracy (pause/resume updates DB)
    let status = 'running';
    try {
      const row = this._db
        .prepare('SELECT status FROM autopilot_runs WHERE id = ?')
        .get(this._runId);
      if (row) status = row.status;
    } catch {
      // Fall back to in-memory state if DB read fails
      status = this.paused ? 'paused' : this._stopped ? 'stopped' : 'running';
    }
    return {
      runId: this._runId,
      status,
      currentPhaseNum: this._currentPhase,
      projectName: this._projectName,
      startedAt: null, // startedAt not tracked in memory; available from DB if needed
    };
  }

  /**
   * Permanently stop the loop. Status updated to 'stopped'.
   */
  stop() {
    this._stopped = true;
    this.paused = false;
    this._pendingConfirmation = false;
    this._pendingCommand = null;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    if (this._runId) {
      const row = this._db
        .prepare('SELECT status FROM autopilot_runs WHERE id = ?')
        .get(this._runId);
      // Only mark stopped if not already in a terminal state
      if (row && !['completed', 'failed'].includes(row.status)) {
        this._db
          .prepare("UPDATE autopilot_runs SET status = 'stopped', ended_at = ? WHERE id = ?")
          .run(new Date().toISOString(), this._runId);
      }
    }
  }

  // ─── Internal loop ──────────────────────────────────────────────────────────

  /**
   * One poll tick. Called by setInterval.
   * Checks paused/stopped flags, detects phase transitions, handles failures.
   */
  _tick() {
    // Guard: stopped or paused — do nothing this tick
    if (this._stopped || this.paused) return;

    // Guard: waiting for user to confirm spawn — do nothing this tick
    if (this._pendingConfirmation) return;

    // Guard: circuit already open — halt
    if (this._cb && this._cb.isOpen()) {
      this._halt();
      return;
    }

    // Phase timeout check
    if (this._phaseStartedAt && (Date.now() - this._phaseStartedAt) > this._maxPhaseMs) {
      this._handlePhaseFailure(this._currentPhase, 'Phase timed out');
      return;
    }

    // Read current project state
    const state = this._readStateFn(this._projectRoot);
    const completedNow = state?.progress?.completed_phases ?? 0;
    const stateStatus = state?.status || null;

    // Detect failure signal in STATE.md status field
    if (stateStatus && (stateStatus.includes('failed') || stateStatus.includes('error'))) {
      this._handlePhaseFailure(this._currentPhase, `STATE.md status: ${stateStatus}`);
      return;
    }

    // Detect phase completion (completed_phases has advanced)
    if (completedNow > this._baselineCompleted) {
      this._onPhaseCompleted(this._currentPhase);
      return;
    }

    // Spawn the GSD command if not yet spawned for this phase
    if (!this._phaseSpawned) {
      this._spawnPhase(this._currentPhase);
    }
  }

  /**
   * Request user confirmation before spawning a phase.
   * Sets _pendingConfirmation=true and broadcasts pending_confirmation status.
   * The tick loop will not spawn until confirmSpawn() is called.
   */
  _spawnPhase(phaseNum) {
    this._phaseSpawned = true;
    this._requestConfirmation(phaseNum);
  }

  /**
   * Set pending_confirmation state and broadcast to the client.
   */
  _requestConfirmation(phaseNum) {
    this._pendingConfirmation = true;
    this._pendingCommand = { phaseNum };
    this._broadcastFn('autopilot_progress', {
      projectName: this._projectName,
      phaseNum,
      status: 'pending_confirmation',
      pendingCommand: `/gsd:execute-phase ${phaseNum}`,
      runId: this._runId,
    });
  }

  /**
   * Execute the actual spawn after confirmation. Uses a 5-minute waitForIdle
   * timeout to handle busy sessions. On timeout, broadcasts queue_timeout and
   * triggers _handlePhaseFailure.
   */
  _doSpawn(phaseNum) {
    this._broadcastFn('autopilot_progress', {
      projectName: this._projectName,
      phaseNum,
      status: 'started',
      runId: this._runId,
    });
    const result = this._spawnFn(this._projectName, '/gsd:execute-phase', {
      args: [`${phaseNum}`],
      runId: this._runId,
      db: this._db,
      waitTimeoutMs: 300000, // 5-minute queue timeout
    });
    // Handle async spawnFn: reset _phaseSpawned if waitForIdle times out
    if (result && typeof result.then === 'function') {
      result.catch((err) => {
        const isQueueTimeout = err && (
          String(err.message || '').includes('Timeout waiting for idle') ||
          String(err.message || '').includes('timed out')
        );
        if (isQueueTimeout) {
          // Broadcast queue_timeout and stop the run
          this._broadcastFn('autopilot_progress', {
            projectName: this._projectName,
            phaseNum,
            status: 'queue_timeout',
            runId: this._runId,
          });
          this._handlePhaseFailure(phaseNum, 'Queue timeout: session busy for 5 minutes');
        } else {
          // Non-timeout error — allow next tick to re-request confirmation
          this._phaseSpawned = false;
        }
      });
    }
  }

  /**
   * Called when a phase completes successfully.
   * Advances to next phase or marks the run complete.
   */
  _onPhaseCompleted(phaseNum) {
    this._broadcastFn('autopilot_progress', {
      projectName: this._projectName,
      phaseNum,
      status: 'completed',
      runId: this._runId,
    });

    // Advance to next phase
    this._currentPhase++;
    this._baselineCompleted = this._baselineCompleted + 1;
    this._phaseSpawned = false;
    this._retryAttempted = false;
    this._failureRecorded = false;
    this._phaseStartedAt = Date.now();
    // Defensive: clear any stale pending confirmation from the previous phase
    this._pendingConfirmation = false;
    this._pendingCommand = null;

    // Check if all phases are done
    if (this._currentPhase > this._totalPhases) {
      this._complete();
    }
  }

  /**
   * Handle a phase failure. Retry once, then record the failure in CircuitBreaker.
   */
  _handlePhaseFailure(phaseNum, reason) {
    if (!this._retryAttempted) {
      // First failure — attempt retry with adjusted prompt
      this._retryAttempted = true;
      this._broadcastFn('autopilot_progress', {
        projectName: this._projectName,
        phaseNum,
        status: 'retrying',
        runId: this._runId,
      });
      this._spawnFn(this._projectName, '/gsd:execute-phase', {
        args: [
          `${phaseNum}`,
          '--retry',
          `Phase ${phaseNum} failed. Previous attempt: ${reason}. Adjust approach.`,
        ],
        runId: this._runId,
        db: this._db,
      });
      return;
    }

    // Retry already attempted — record failure in CircuitBreaker (only once per phase)
    if (this._failureRecorded) return;
    this._failureRecorded = true;

    this._broadcastFn('autopilot_progress', {
      projectName: this._projectName,
      phaseNum,
      status: 'failed',
      runId: this._runId,
    });

    const shouldHalt = this._cb ? this._cb.recordFailure(phaseNum) : false;

    if (shouldHalt || (this._cb && this._cb.isOpen())) {
      this._halt();
    } else {
      // Circuit still closed — advance past the failed phase and continue
      this._currentPhase++;
      this._phaseSpawned = false;
      this._retryAttempted = false;
      this._failureRecorded = false;
      this._phaseStartedAt = Date.now();
    }
  }

  /**
   * Halt the loop because the circuit opened (too many failures).
   */
  _halt() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._stopped = true;
    this._pendingConfirmation = false;
    this._pendingCommand = null;

    if (this._runId) {
      this._db
        .prepare("UPDATE autopilot_runs SET status = 'failed', ended_at = ? WHERE id = ?")
        .run(new Date().toISOString(), this._runId);
    }

    this._broadcastFn('autopilot_halted', {
      projectName: this._projectName,
      runId: this._runId,
      reason: 'CircuitBreaker opened — too many consecutive failures',
    });
  }

  /**
   * All phases completed successfully — mark run as completed.
   */
  _complete() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._stopped = true;

    if (this._runId) {
      this._db
        .prepare("UPDATE autopilot_runs SET status = 'completed', ended_at = ? WHERE id = ?")
        .run(new Date().toISOString(), this._runId);
    }

    this._broadcastFn('autopilot_progress', {
      projectName: this._projectName,
      phaseNum: null,
      status: 'completed',
      runId: this._runId,
    });
  }
}

module.exports = { AutopilotManager };
