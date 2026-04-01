'use strict';
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

/**
 * Spawn a GSD command into a project's tmux session, detached from Express.
 * Records the job in process_registry and returns a jobId immediately (non-blocking).
 *
 * @param {string} projectName - matches gsd-projects.json projects[].name
 * @param {string} gsdCommand - e.g. '/gsd:plan-phase'
 * @param {object} options
 * @param {string[]} [options.args=[]] - additional CLI args appended to gsdCommand
 * @param {string|null} [options.runId=null] - autopilot_runs.id if applicable
 * @param {Function} [options.spawnFn] - injectable spawn for testing (default: child_process.spawn)
 * @param {object|null} [options.db] - injectable db for testing (default: production db)
 * @returns {{ jobId: string, pid: number|null, started_at: string }}
 */
function spawnGsdCommand(projectName, gsdCommand, options = {}) {
  const { args = [], runId = null, spawnFn = spawn, db = null } = options;
  const _db = db || require('../db').db;

  const configPath = process.env.GSD_PROJECTS_PATH ||
    path.join(__dirname, '../../gsd-projects.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const project = config.projects.find(p => p.name === projectName);

  if (!project?.tmux_session) {
    throw new Error(`Project '${projectName}' has no tmux_session configured`);
  }

  const jobId = uuidv4();
  const startedAt = new Date().toISOString();

  // Insert into process_registry BEFORE spawning — so the record always exists
  // even if the spawned process crashes immediately
  _db.prepare(
    'INSERT INTO process_registry (id, run_id, command, args, started_at) VALUES (?, ?, ?, ?, ?)'
  ).run(jobId, runId, gsdCommand, JSON.stringify(args), startedAt);

  // Build the command string to send via tmux send-keys
  const fullCommand = args.length > 0
    ? `${gsdCommand} ${args.join(' ')}`
    : gsdCommand;

  const child = spawnFn(
    'tmux',
    ['send-keys', '-t', project.tmux_session, fullCommand, 'Enter'],
    {
      detached: true,
      stdio: 'ignore',
      cwd: project.root || process.cwd(),
    }
  );

  // Record PID if the process provided one
  if (child.pid) {
    _db.prepare('UPDATE process_registry SET pid = ? WHERE id = ?').run(child.pid, jobId);
  }

  // Update exit status when the tmux send-keys process terminates
  child.on('exit', (code, signal) => {
    const endedAt = new Date().toISOString();
    const exitCode = code !== null ? code : (signal ? -1 : null);
    _db.prepare(
      'UPDATE process_registry SET exit_code = ?, ended_at = ? WHERE id = ?'
    ).run(exitCode, endedAt, jobId);
  });

  return { jobId, pid: child.pid ?? null, started_at: startedAt };
}

module.exports = { spawnGsdCommand };
