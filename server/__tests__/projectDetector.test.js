'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// These tests import from ../gsd/projectDetector which does not exist yet.
// They will be RED (MODULE_NOT_FOUND) until Task 2 creates it.
const { detectUnregisteredFolders, isProject, MANIFEST_FILES } = require('../gsd/projectDetector');

// --- isProject ---

describe('isProject', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detector-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('detector.isProject: true when .git exists', () => {
    const dir = path.join(tmpDir, 'git-proj');
    fs.mkdirSync(dir);
    fs.mkdirSync(path.join(dir, '.git'));
    assert.strictEqual(isProject(dir), true);
  });

  test('detector.isProject: true when package.json exists', () => {
    const dir = path.join(tmpDir, 'node-proj');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'package.json'), '{}', 'utf8');
    assert.strictEqual(isProject(dir), true);
  });

  test('detector.isProject: true when pyproject.toml exists', () => {
    const dir = path.join(tmpDir, 'py-proj');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'pyproject.toml'), '', 'utf8');
    assert.strictEqual(isProject(dir), true);
  });

  test('detector.isProject: true when Cargo.toml exists', () => {
    const dir = path.join(tmpDir, 'rust-proj');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '', 'utf8');
    assert.strictEqual(isProject(dir), true);
  });

  test('detector.isProject: true when go.mod exists', () => {
    const dir = path.join(tmpDir, 'go-proj');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'go.mod'), '', 'utf8');
    assert.strictEqual(isProject(dir), true);
  });

  test('detector.isProject: false for empty directory', () => {
    const dir = path.join(tmpDir, 'empty-dir');
    fs.mkdirSync(dir);
    assert.strictEqual(isProject(dir), false);
  });

  test('detector.isProject: false for dir with only unrecognized files', () => {
    const dir = path.join(tmpDir, 'unknown-files');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'something.txt'), 'content', 'utf8');
    fs.writeFileSync(path.join(dir, 'README.md'), '# hi', 'utf8');
    assert.strictEqual(isProject(dir), false);
  });

  test('detector.isProject: false for nonexistent path (no throw)', () => {
    const nonexistent = path.join(tmpDir, 'does-not-exist');
    assert.strictEqual(isProject(nonexistent), false);
  });
});

// --- detectUnregisteredFolders ---

describe('detectUnregisteredFolders', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-root-'));
  });

  afterEach(() => {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  function makeProjectDir(root, name) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{}', 'utf8');
    return dir;
  }

  test('detector.scan: returns absolute paths for project dirs', () => {
    makeProjectDir(tmpRoot, 'my-project');
    const results = detectUnregisteredFolders(tmpRoot, []);
    assert.ok(results.length >= 1, 'Should find at least one project');
    assert.ok(
      results.every((r) => path.isAbsolute(r)),
      'All results must be absolute paths'
    );
    assert.ok(
      results.some((r) => r.endsWith('my-project')),
      'Should include my-project'
    );
  });

  test('detector.scan: skips registered folders', () => {
    makeProjectDir(tmpRoot, 'existing-proj');
    makeProjectDir(tmpRoot, 'new-proj');
    const results = detectUnregisteredFolders(tmpRoot, ['existing-proj']);
    assert.ok(!results.some((r) => r.endsWith('existing-proj')), 'Should skip registered folder');
    assert.ok(results.some((r) => r.endsWith('new-proj')), 'Should include new-proj');
  });

  test('detector.scan: skips dotfile directories', () => {
    makeProjectDir(tmpRoot, '.hidden-proj');
    makeProjectDir(tmpRoot, 'visible-proj');
    const results = detectUnregisteredFolders(tmpRoot, []);
    assert.ok(!results.some((r) => r.endsWith('.hidden-proj')), 'Should skip dotfile dirs');
    assert.ok(results.some((r) => r.endsWith('visible-proj')), 'Should include visible-proj');
  });

  test('detector.scan: skips known non-project dirs (node_modules, dist, .venv, venv)', () => {
    // These need to look like projects to really test exclusion
    const excludeDirs = ['node_modules', 'dist', '.venv', 'venv'];
    for (const name of excludeDirs) {
      const dir = path.join(tmpRoot, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), '{}', 'utf8');
    }
    makeProjectDir(tmpRoot, 'real-project');
    const results = detectUnregisteredFolders(tmpRoot, []);
    for (const name of excludeDirs) {
      assert.ok(!results.some((r) => r.endsWith(path.sep + name)), `Should skip ${name}`);
    }
    assert.ok(results.some((r) => r.endsWith('real-project')), 'Should include real-project');
  });

  test('detector.scan: returns [] for unreadable root (no throw)', () => {
    const nonexistent = path.join(tmpRoot, 'does-not-exist');
    const results = detectUnregisteredFolders(nonexistent, []);
    assert.deepStrictEqual(results, []);
  });

  test('detector.scan: returns [] if all folders are non-projects', () => {
    const dir = path.join(tmpRoot, 'empty-folder');
    fs.mkdirSync(dir);
    // No manifest files — not a project
    const results = detectUnregisteredFolders(tmpRoot, []);
    assert.deepStrictEqual(results, []);
  });

  test('detector.scan: does not include files, only directories', () => {
    // Create a file at root level (not a directory)
    fs.writeFileSync(path.join(tmpRoot, 'somefile.txt'), 'content', 'utf8');
    makeProjectDir(tmpRoot, 'real-project');
    const results = detectUnregisteredFolders(tmpRoot, []);
    assert.ok(results.every((r) => {
      try { return fs.statSync(r).isDirectory(); } catch { return false; }
    }), 'All results must be directories');
  });
});

// --- MANIFEST_FILES ---

test('detector.manifest: MANIFEST_FILES is exported as an array', () => {
  assert.ok(Array.isArray(MANIFEST_FILES));
  assert.ok(MANIFEST_FILES.includes('package.json'));
  assert.ok(MANIFEST_FILES.includes('.git'));
});
