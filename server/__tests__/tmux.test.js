'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { _testDetectFromOutput } = require('../gsd/tmux.js');

// UX-01: Timer pattern variants — Claude Code activity indicator must return 'working'
test('waiting.accuracy: timer "(4m 19s · ↓ 539 tokens" → working', () => {
  assert.strictEqual(_testDetectFromOutput('> (4m 19s · ↓ 539 tokens'), 'working');
});

test('waiting.accuracy: timer "(30s · ↓" → working', () => {
  assert.strictEqual(_testDetectFromOutput('(30s · ↓ 12 tokens'), 'working');
});

test('waiting.accuracy: standalone "· ↓ 3.2" → working', () => {
  assert.strictEqual(_testDetectFromOutput('· ↓ 3.2 tokens/s'), 'working');
});

test('waiting.accuracy: bidirectional "· ↑ 22 tokens · ↓ 539 tokens" → working', () => {
  assert.strictEqual(_testDetectFromOutput('· ↑ 22 tokens · ↓ 539 tokens'), 'working');
});

test('waiting.accuracy: thinking indicator "(thinking)" → working', () => {
  assert.strictEqual(_testDetectFromOutput('Claude is (thinking)'), 'working');
});

// Waiting patterns — user interaction required
test('waiting.accuracy: numbered option "> 1. Option A" → waiting', () => {
  assert.strictEqual(_testDetectFromOutput('> 1. Option A'), 'waiting');
});

test('waiting.accuracy: confirmation prompt "[y/n]" → waiting', () => {
  assert.strictEqual(_testDetectFromOutput('Do you want to continue? [y/n]'), 'waiting');
});

test('waiting.accuracy: plain shell prompt, no timer → waiting', () => {
  assert.strictEqual(_testDetectFromOutput('$ '), 'waiting');
});
