'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

// Set env vars BEFORE any require that touches db or config
const TEST_DB = path.join(os.tmpdir(), `task-migration-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;
const TEST_PROJECTS_JSON = path.join(os.tmpdir(), `gsd-projects-migration-${Date.now()}-${process.pid}.json`);
process.env.GSD_PROJECTS_PATH = TEST_PROJECTS_JSON;

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { createApp, startServer } = require('../index');
const { db } = require('../db');
const { extractRepoFromUrl, createSnapshot, restoreSnapshot } = require('../gsd/taskMigration');

let server;
let BASE;
let tmpDir;

function fetchJson(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function writeProjects(projects) {
  fs.writeFileSync(TEST_PROJECTS_JSON, JSON.stringify({ projects }, null, 2));
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-migration-snap-'));
  writeProjects([]);
  const app = createApp();
  server = await startServer(app, 0);
  BASE = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (server) server.close();
  if (db) db.close();
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_PROJECTS_JSON); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  setTimeout(() => process.exit(0), 100);
});

beforeEach(() => {
  // Reset projects file with a standard test project
  writeProjects([{
    name: 'test-proj',
    root: tmpDir,
    tmux_session: 'test-proj',
    stage: 'beta',
  }]);
  // Clear project_tasks between tests
  db.prepare('DELETE FROM project_tasks').run();
});

describe('Task Migration', () => {

  describe('extractRepoFromUrl', () => {
    it('parses https URL with .git suffix', () => {
      assert.equal(extractRepoFromUrl('https://github.com/owner/repo.git'), 'owner/repo');
    });

    it('parses SSH URL', () => {
      assert.equal(extractRepoFromUrl('git@github.com:owner/repo.git'), 'owner/repo');
    });

    it('returns null for gitlab.com', () => {
      assert.equal(extractRepoFromUrl('https://gitlab.com/owner/repo'), null);
    });

    it('returns null for empty string', () => {
      assert.equal(extractRepoFromUrl(''), null);
    });
  });

  describe('createSnapshot', () => {
    it('writes .json file with open tasks only', async () => {
      // Insert 2 open tasks and 1 archived task
      db.prepare('INSERT INTO project_tasks (project_key, title, archived) VALUES (?, ?, ?)').run('test-proj', 'Open Task 1', 0);
      db.prepare('INSERT INTO project_tasks (project_key, title, archived) VALUES (?, ?, ?)').run('test-proj', 'Open Task 2', 0);
      db.prepare('INSERT INTO project_tasks (project_key, title, archived) VALUES (?, ?, ?)').run('test-proj', 'Archived Task', 1);

      const filepath = await createSnapshot(tmpDir, 'test-proj');

      assert.ok(fs.existsSync(filepath), 'snapshot file should exist');
      const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      assert.equal(content.projectName, 'test-proj');
      assert.equal(content.taskCount, 2, 'taskCount should reflect only open tasks');
      assert.ok(Array.isArray(content.tasks));
      assert.ok(content.exportedAt, 'exportedAt should be set');
    });

    it('excludes archived tasks', async () => {
      db.prepare('INSERT INTO project_tasks (project_key, title, archived) VALUES (?, ?, ?)').run('test-proj', 'Archived Only', 1);

      const filepath = await createSnapshot(tmpDir, 'test-proj');
      const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      assert.equal(content.taskCount, 0, 'archived tasks should be excluded');
      assert.deepEqual(content.tasks, []);
    });
  });

  describe('restoreSnapshot', () => {
    it('throws when no snapshot exists', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-snap-'));
      try {
        await assert.rejects(
          () => restoreSnapshot(emptyDir, 'test-proj'),
          /No task snapshot found/
        );
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it('inserts tasks from snapshot into DB', async () => {
      // First create a snapshot with tasks
      db.prepare('INSERT INTO project_tasks (project_key, title, archived) VALUES (?, ?, ?)').run('test-proj', 'Restore Me', 0);
      db.prepare('INSERT INTO project_tasks (project_key, title, archived) VALUES (?, ?, ?)').run('test-proj', 'Restore Me Too', 0);
      await createSnapshot(tmpDir, 'test-proj');

      // Clear DB to simulate restore scenario
      db.prepare('DELETE FROM project_tasks WHERE project_key = ?').run('test-proj');
      const before = db.prepare('SELECT COUNT(*) as c FROM project_tasks WHERE project_key = ?').get('test-proj');
      assert.equal(before.c, 0);

      await restoreSnapshot(tmpDir, 'test-proj');

      const after = db.prepare('SELECT COUNT(*) as c FROM project_tasks WHERE project_key = ?').get('test-proj');
      assert.equal(after.c, 2, 'should restore 2 tasks');
    });
  });

  describe('POST /migrate route', () => {
    it('returns 422 for gsddashboard project (D-12 self-migration guard)', async () => {
      writeProjects([{
        name: 'gsddashboard',
        root: tmpDir,
        tmux_session: 'gsddashboard',
        stage: 'beta',
      }]);
      const r = await fetchJson('/api/gsd/projects/gsddashboard/migrate', { method: 'POST' });
      assert.equal(r.status, 422, 'should return 422 for self-migration');
    });

    it('returns 404 for unknown project name', async () => {
      const r = await fetchJson('/api/gsd/projects/unknown-zzz/migrate', { method: 'POST' });
      assert.equal(r.status, 404, 'should return 404 for unknown project');
    });

    it('returns 409 when project.task_backend is already github', async () => {
      writeProjects([{
        name: 'already-migrated',
        root: tmpDir,
        tmux_session: 'already-migrated',
        stage: 'beta',
        task_backend: 'github',
        github_repo: 'owner/repo',
        taskMigratedAt: new Date().toISOString(),
      }]);
      const r = await fetchJson('/api/gsd/projects/already-migrated/migrate', { method: 'POST' });
      assert.equal(r.status, 409, 'should return 409 when already migrated');
    });
  });

  describe('POST /rollback-migration route', () => {
    it('returns 400 when task_backend is dashboard (not in github backend)', async () => {
      writeProjects([{
        name: 'test-proj',
        root: tmpDir,
        tmux_session: 'test-proj',
        stage: 'beta',
        task_backend: 'dashboard',
      }]);
      const r = await fetchJson('/api/gsd/projects/test-proj/rollback-migration', { method: 'POST' });
      assert.equal(r.status, 400, 'should return 400 when not on github backend');
    });

    it('returns 410 when 7-day rollback window has expired', async () => {
      const expiredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      writeProjects([{
        name: 'test-proj',
        root: tmpDir,
        tmux_session: 'test-proj',
        stage: 'launched',
        task_backend: 'github',
        github_repo: 'owner/repo',
        taskMigratedAt: expiredAt,
      }]);
      const r = await fetchJson('/api/gsd/projects/test-proj/rollback-migration', { method: 'POST' });
      assert.equal(r.status, 410, 'should return 410 when rollback window expired');
    });
  });

});
