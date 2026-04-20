'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// These tests import from ../gsd/projectScaffold which does not exist yet.
// They will be RED (MODULE_NOT_FOUND) until Task 1 creates it.
const { scaffoldProject, sanitizeName, STEP_SEQUENCE } = require('../gsd/projectScaffold');

// --- sanitizeName ---

test('scaffold.sanitize: basic lowercase conversion', () => {
  assert.strictEqual(sanitizeName('My Project!'), 'my-project');
});

test('scaffold.sanitize: trims leading/trailing dashes from edge padding', () => {
  assert.strictEqual(sanitizeName('  --foo--  '), 'foo');
});

test('scaffold.sanitize: strips non-ASCII characters (Héllo → hllo)', () => {
  assert.strictEqual(sanitizeName('Héllo'), 'hllo');
});

test('scaffold.sanitize: collapses mixed spaces and dashes (a__b  c → a-b-c)', () => {
  // double-underscore is stripped (not [a-z0-9\s-]) → "a  b  c" → "a-b-c"
  assert.strictEqual(sanitizeName('a__b  c'), 'a-b-c');
});

test('scaffold.sanitize: returns empty string for empty input', () => {
  assert.strictEqual(sanitizeName(''), '');
});

test('scaffold.sanitize: handles null/undefined gracefully', () => {
  assert.strictEqual(sanitizeName(null), '');
  assert.strictEqual(sanitizeName(undefined), '');
});

test('scaffold.sanitize: all lowercase, collapses dashes', () => {
  assert.strictEqual(sanitizeName('Hello   World'), 'hello-world');
});

// --- STEP_SEQUENCE ---

test('scaffold.steps: STEP_SEQUENCE is an array', () => {
  assert.ok(Array.isArray(STEP_SEQUENCE));
  assert.ok(STEP_SEQUENCE.length > 0);
});

test('scaffold.steps: STEP_SEQUENCE contains scaffold as first step', () => {
  assert.strictEqual(STEP_SEQUENCE[0], 'scaffold');
});

// --- scaffoldProject ---

describe('scaffoldProject', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('scaffold.create: creates README.md with h1 containing project name', () => {
    const root = path.join(tmpDir, 'my-project');
    scaffoldProject(root, { name: 'My Project', description: 'A test project' });

    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.ok(readme.includes('# My Project'), `README.md should contain "# My Project", got: ${readme}`);
  });

  test('scaffold.create: creates .gitignore with node_modules/', () => {
    const root = path.join(tmpDir, 'test-proj');
    scaffoldProject(root, { name: 'Test Proj' });

    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('node_modules/'), '.gitignore must contain node_modules/');
  });

  test('scaffold.create: .gitignore contains .env', () => {
    const root = path.join(tmpDir, 'test-proj2');
    scaffoldProject(root, { name: 'Test Proj 2' });

    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('.env'), '.gitignore must contain .env');
  });

  test('scaffold.create: .gitignore contains .planning/worktrees', () => {
    const root = path.join(tmpDir, 'test-proj3');
    scaffoldProject(root, { name: 'Test Proj 3' });

    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('.planning/worktrees'), '.gitignore must contain .planning/worktrees');
  });

  test('scaffold.create: creates valid package.json with correct name field', () => {
    const root = path.join(tmpDir, 'pkg-test');
    scaffoldProject(root, { name: 'My New Package' });

    const pkgRaw = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    assert.strictEqual(pkg.name, sanitizeName('My New Package'));
    assert.ok(pkg.version, 'package.json must have version field');
  });

  test('scaffold.create: throws if directory already exists', () => {
    const root = path.join(tmpDir, 'existing-dir');
    fs.mkdirSync(root);

    assert.throws(
      () => scaffoldProject(root, { name: 'test' }),
      /already exists/i,
      'Should throw when directory already exists'
    );
  });

  test('scaffold.create: creates directory with all three required files', () => {
    const root = path.join(tmpDir, 'full-test');
    scaffoldProject(root, { name: 'Full Test', description: 'Full desc' });

    assert.ok(fs.existsSync(path.join(root, 'README.md')), 'README.md must exist');
    assert.ok(fs.existsSync(path.join(root, '.gitignore')), '.gitignore must exist');
    assert.ok(fs.existsSync(path.join(root, 'package.json')), 'package.json must exist');
  });
});
