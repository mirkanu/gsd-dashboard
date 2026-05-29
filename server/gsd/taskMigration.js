'use strict';

const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { db } = require('../db');

/**
 * Detect the GitHub remote URL for a project root.
 * Returns the raw URL string or null if no github.com remote is found.
 */
async function detectRepoUrl(projectRoot) {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectRoot,
      timeout: 5000,
    });
    const url = stdout.trim();
    if (url && url !== 'origin' && url.includes('github.com')) {
      return url;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

/**
 * Parse GitHub repo URL to "owner/repo" string.
 * Handles https, ssh, .git suffix, trailing slash.
 * Returns null for non-github.com URLs.
 */
function extractRepoFromUrl(url) {
  if (!url) return null;
  const match = url.match(
    /(?:https?:\/\/|git@)github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Write a pre-migration snapshot of all open tasks to a JSON file in projectRoot.
 * File: .dashboard-task-snapshot-{iso-timestamp}.json
 * Returns the absolute file path of the created snapshot.
 */
async function createSnapshot(projectRoot, projectName) {
  const tasks = db.prepare(
    'SELECT id, title, description, created_at FROM project_tasks WHERE project_key = ? AND archived = 0'
  ).all(projectName);

  const exportedAt = new Date().toISOString();
  const snapshot = {
    projectName,
    exportedAt,
    taskCount: tasks.length,
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      created_at: t.created_at,
    })),
  };

  // Milliseconds included to avoid collision on rapid retries
  const timestamp = exportedAt.replace(/[:.]/g, '-').replace('Z', '');
  const filename = `.dashboard-task-snapshot-${timestamp}.json`;
  const filepath = path.join(projectRoot, filename);

  await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2), 'utf8');
  return filepath;
}

/**
 * Export all open tasks to GitHub as issues, labeled 'source:dashboard-migration'.
 * Runs sequentially to avoid rate-limit issues.
 * Returns { exported: [{task_id, issue_number}], failed: [{task_id, error}] }
 */
async function exportTasks({ projectName, repoUrl, githubPat }) {
  const tasks = db.prepare(
    'SELECT id, title, description, created_at FROM project_tasks WHERE project_key = ? AND archived = 0'
  ).all(projectName);

  const exported = [];
  const failed = [];

  for (const task of tasks) {
    try {
      const body = `ID: task-${task.id}\nCreated: ${task.created_at}\n\n${task.description || '(no description)'}`;

      const { stdout } = await execFileAsync('gh', [
        'issue', 'create',
        '--repo', repoUrl,
        '--title', task.title,
        '--body', body,
        '--label', 'source:dashboard-migration',
      ], {
        timeout: 15000,
        env: { ...process.env, GH_TOKEN: githubPat },
      });

      const match = stdout.match(/\/issues\/(\d+)/);
      if (match) {
        exported.push({ task_id: task.id, issue_number: match[1] });
      } else {
        exported.push({ task_id: task.id, issue_number: null });
      }
    } catch (err) {
      failed.push({ task_id: task.id, error: err.message.split('\n')[0] });
    }
  }

  return { exported, failed };
}

/**
 * Restore tasks from the most recent snapshot file in projectRoot.
 * Inserts tasks into project_tasks table (does NOT delete existing rows first — caller must decide).
 * Returns the snapshot data used for restoration.
 */
async function restoreSnapshot(projectRoot, projectName) {
  const files = await fs.readdir(projectRoot);
  const snapshots = files
    .filter(f => f.startsWith('.dashboard-task-snapshot-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (snapshots.length === 0) {
    throw new Error(`No task snapshot found for project ${projectName}`);
  }

  const snapshotPath = path.join(projectRoot, snapshots[0]);
  const raw = await fs.readFile(snapshotPath, 'utf8');
  const snapshot = JSON.parse(raw);

  const insert = db.prepare(
    'INSERT INTO project_tasks (project_key, title, description, archived, created_at) VALUES (?, ?, ?, 0, ?)'
  );
  for (const task of snapshot.tasks) {
    insert.run(projectName, task.title, task.description, task.created_at);
  }

  return snapshot;
}

module.exports = {
  detectRepoUrl,
  createSnapshot,
  extractRepoFromUrl,
  exportTasks,
  restoreSnapshot,
};
