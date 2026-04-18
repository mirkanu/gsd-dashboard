'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '..', 'gsd-busy-marker.js');

let tmpDir;
let markersDir;
let projectsPath;
let projectRoot;
const TMUX_SESSION = 'test-session';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'busy-hook-test-'));
  markersDir = path.join(tmpDir, 'busy-markers');
  fs.mkdirSync(markersDir, { recursive: true });

  projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });

  projectsPath = path.join(tmpDir, 'gsd-projects.json');
  fs.writeFileSync(projectsPath, JSON.stringify({
    projects: [
      { name: 'proj', root: projectRoot, tmux_session: TMUX_SESSION },
    ],
  }));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function runHook(payload, { env = {}, input } = {}) {
  const stdin = input !== undefined ? input : JSON.stringify(payload);
  return spawnSync(process.execPath, [HOOK], {
    input: stdin,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      GSD_PROJECTS_PATH: projectsPath,
      GSD_BUSY_MARKERS_DIR: markersDir,
      ...env,
    },
  });
}

function markerFile(session) {
  return path.join(markersDir, `${session}.json`);
}

test('PreToolUse Bash run_in_background=true → marker file with kind=bash_bg', () => {
  const res = runHook({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'sleep 60', description: 'long poll', run_in_background: true },
    tool_use_id: 'shell-abc',
    cwd: projectRoot,
  });
  assert.strictEqual(res.status, 0, `hook should exit 0 (stderr: ${res.stderr})`);
  const fp = markerFile(TMUX_SESSION);
  assert.ok(fs.existsSync(fp), 'marker file should exist');
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  assert.strictEqual(data.markers.length, 1);
  assert.strictEqual(data.markers[0].kind, 'bash_bg');
  assert.strictEqual(data.markers[0].id, 'shell-abc');
});

test('PreToolUse Bash run_in_background=false → no marker file created', () => {
  const res = runHook({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls', run_in_background: false },
    tool_use_id: 'shell-xyz',
    cwd: projectRoot,
  });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(fs.existsSync(markerFile(TMUX_SESSION)), false);
});

test('PreToolUse Agent → marker file with kind=agent', () => {
  const res = runHook({
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: { description: 'deep research' },
    tool_use_id: 'agent-1',
    cwd: projectRoot,
  });
  assert.strictEqual(res.status, 0);
  const data = JSON.parse(fs.readFileSync(markerFile(TMUX_SESSION), 'utf8'));
  assert.strictEqual(data.markers[0].kind, 'agent');
  assert.strictEqual(data.markers[0].id, 'agent-1');
});

test('PostToolUse Bash with matching id → marker cleared (file deleted)', () => {
  // Pre-seed marker
  runHook({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { run_in_background: true },
    tool_use_id: 'shell-1',
    cwd: projectRoot,
  });
  assert.ok(fs.existsSync(markerFile(TMUX_SESSION)));

  const res = runHook({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_use_id: 'shell-1',
    cwd: projectRoot,
  });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(fs.existsSync(markerFile(TMUX_SESSION)), false, 'file deleted after last marker cleared');
});

test('khw.pivot: PostToolUse Agent with matching id → agent marker cleared', () => {
  runHook({
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: { description: 'deep research' },
    tool_use_id: 'agent-posttool-1',
    cwd: projectRoot,
  });
  assert.ok(fs.existsSync(markerFile(TMUX_SESSION)));

  const res = runHook({
    hook_event_name: 'PostToolUse',
    tool_name: 'Agent',
    tool_use_id: 'agent-posttool-1',
    cwd: projectRoot,
  });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(fs.existsSync(markerFile(TMUX_SESSION)), false, 'Agent marker cleared on PostToolUse');
});

test('khw.pivot: PostToolUse Task with matching id → task marker cleared', () => {
  runHook({
    hook_event_name: 'PreToolUse',
    tool_name: 'Task',
    tool_input: { description: 'sub' },
    tool_use_id: 'task-42',
    cwd: projectRoot,
  });
  assert.ok(fs.existsSync(markerFile(TMUX_SESSION)));

  const res = runHook({
    hook_event_name: 'PostToolUse',
    tool_name: 'Task',
    tool_use_id: 'task-42',
    cwd: projectRoot,
  });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(fs.existsSync(markerFile(TMUX_SESSION)), false);
});

test('SubagentStop with id → agent marker cleared', () => {
  runHook({
    hook_event_name: 'PreToolUse',
    tool_name: 'Task',
    tool_input: { description: 'sub' },
    tool_use_id: 'agent-7',
    cwd: projectRoot,
  });
  assert.ok(fs.existsSync(markerFile(TMUX_SESSION)));

  const res = runHook({
    hook_event_name: 'SubagentStop',
    tool_use_id: 'agent-7',
    cwd: projectRoot,
  });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(fs.existsSync(markerFile(TMUX_SESSION)), false);
});

test('malformed JSON stdin → exit 0, no crash, no file', () => {
  const res = runHook(null, { input: 'not-valid-json{{{' });
  assert.strictEqual(res.status, 0, 'hook must be fail-safe on bad input');
  assert.strictEqual(fs.existsSync(markerFile(TMUX_SESSION)), false);
});

test('cwd outside any tracked project → exit 0, no file created', () => {
  // Override projects.json to a path that won\'t match
  const unrelatedRoot = path.join(tmpDir, 'no-such-project');
  fs.mkdirSync(unrelatedRoot, { recursive: true });
  const res = runHook({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { run_in_background: true },
    tool_use_id: 'shell-lost',
    cwd: unrelatedRoot,
  });
  assert.strictEqual(res.status, 0);
  // No marker file should exist for TMUX_SESSION (or anywhere else)
  const files = fs.readdirSync(markersDir);
  assert.strictEqual(files.length, 0, `no marker files should be written (found: ${files.join(',')})`);
});

test('path-traversal tmux session in projects.json → no file outside base dir', () => {
  // Rewrite projects.json with a malicious tmux_session
  fs.writeFileSync(projectsPath, JSON.stringify({
    projects: [{ name: 'evil', root: projectRoot, tmux_session: '../pwned' }],
  }));
  const res = runHook({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { run_in_background: true },
    tool_use_id: 'shell-x',
    cwd: projectRoot,
  });
  assert.strictEqual(res.status, 0);
  // Neither the legitimate file nor any outside-base-dir file should exist
  assert.strictEqual(fs.existsSync(path.join(tmpDir, 'pwned.json')), false);
  assert.strictEqual(fs.existsSync(markerFile(TMUX_SESSION)), false);
});
