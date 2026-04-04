'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyLine,
  classifyChunks,
  MESSAGE_TYPES,
} = require('../gsd/classifierPatterns');

const {
  stageBannerSamples,
  checkpointSamples,
  completionSamples,
  errorSamples,
  hiddenToolCallSamples,
  hiddenToolOutputSamples,
  hiddenWorkingSamples,
  hiddenCodeSamples,
  hiddenChromeSamples,
  gsdBannerSamples,
  textSamples,
} = require('./fixtures/tmux-samples');

describe('classifyLine', () => {
  it('Test 1: classifies stage banner', () => {
    const result = classifyLine('## Phase 28: Schema');
    assert.equal(result.msg_type, MESSAGE_TYPES.STAGE_BANNER);
  });

  it('Test 2: classifies Read() as hidden', () => {
    const result = classifyLine('Read(server/db.js)');
    assert.equal(result.msg_type, MESSAGE_TYPES.HIDDEN);
  });

  it('Test 3: classifies Write() as hidden', () => {
    const result = classifyLine('Write(path)');
    assert.equal(result.msg_type, MESSAGE_TYPES.HIDDEN);
  });

  it('Test 4: classifies Bash() as hidden', () => {
    const result = classifyLine('Bash(command)');
    assert.equal(result.msg_type, MESSAGE_TYPES.HIDDEN);
  });

  it('Test 5: classifies error', () => {
    const result = classifyLine('Error: ENOENT: no such file or directory');
    assert.equal(result.msg_type, MESSAGE_TYPES.ERROR);
  });

  it('Test 6: classifies completion', () => {
    const result = classifyLine('PHASE COMPLETE');
    assert.equal(result.msg_type, MESSAGE_TYPES.COMPLETION);
  });

  it('Test 7: classifies checkpoint', () => {
    const result = classifyLine('YOUR ACTION: Review the changes');
    assert.equal(result.msg_type, MESSAGE_TYPES.CHECKPOINT);
  });

  it('Test 8: classifies thinking as hidden', () => {
    const result = classifyLine('(thinking)');
    assert.equal(result.msg_type, MESSAGE_TYPES.HIDDEN);
  });

  it('Test 9: classifies regular text as text', () => {
    const result = classifyLine('regular text about the implementation');
    assert.equal(result.msg_type, MESSAGE_TYPES.TEXT);
  });

  it('Test 10: ANSI codes stripped before classification', () => {
    const clean = classifyLine('PHASE COMPLETE');
    const ansi = classifyLine('\x1b[32mPHASE COMPLETE\x1b[0m');
    assert.equal(clean.msg_type, ansi.msg_type);
    assert.equal(ansi.msg_type, MESSAGE_TYPES.COMPLETION);
    // Content should be clean (no ANSI)
    assert.equal(ansi.content, 'PHASE COMPLETE');
  });

  it('Test 11: classifies numbered code lines as hidden', () => {
    const result = classifyLine('  1 | const x = 42;');
    assert.equal(result.msg_type, MESSAGE_TYPES.HIDDEN);
  });

  it('returns null for empty/whitespace lines', () => {
    assert.equal(classifyLine(''), null);
    assert.equal(classifyLine('   '), null);
    assert.equal(classifyLine('\t\n'), null);
  });

  it('result has correct shape', () => {
    const result = classifyLine('some text');
    assert.ok('msg_type' in result);
    assert.ok('content' in result);
    assert.ok('metadata' in result);
    assert.equal(result.metadata, null);
  });
});

describe('classifyChunks', () => {
  it('Test 12: multi-line input returns array of typed objects', () => {
    const input = '## Phase 28\nRead(file.js)\nSome text here';
    const results = classifyChunks(input);
    assert.equal(results.length, 3);
    assert.equal(results[0].msg_type, MESSAGE_TYPES.STAGE_BANNER);
    assert.equal(results[1].msg_type, MESSAGE_TYPES.HIDDEN);
    assert.equal(results[2].msg_type, MESSAGE_TYPES.TEXT);
  });

  it('Test 13: filters out empty/whitespace-only lines', () => {
    const input = 'line one\n\n   \nline two';
    const results = classifyChunks(input);
    assert.equal(results.length, 2);
  });
});

describe('fixture validation', () => {
  it('Test 14: all hidden tool call samples classified as hidden', () => {
    for (const sample of hiddenToolCallSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.HIDDEN,
        `Expected hidden for: ${sample}`);
    }
  });

  it('Test 15: all stage banner samples classified as stage_banner', () => {
    for (const sample of stageBannerSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.STAGE_BANNER,
        `Expected stage_banner for: ${sample}`);
    }
  });

  it('Test 16: all error samples classified as error', () => {
    for (const sample of errorSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.ERROR,
        `Expected error for: ${sample}`);
    }
  });

  it('all checkpoint samples classified as checkpoint', () => {
    for (const sample of checkpointSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.CHECKPOINT,
        `Expected checkpoint for: ${sample}`);
    }
  });

  it('all completion samples classified as completion', () => {
    for (const sample of completionSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.COMPLETION,
        `Expected completion for: ${sample}`);
    }
  });

  it('all hidden tool output samples classified as hidden', () => {
    for (const sample of hiddenToolOutputSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.HIDDEN,
        `Expected hidden for: ${sample}`);
    }
  });

  it('all hidden working samples classified as hidden', () => {
    for (const sample of hiddenWorkingSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.HIDDEN,
        `Expected hidden for: ${sample}`);
    }
  });

  it('all hidden code samples classified as hidden', () => {
    for (const sample of hiddenCodeSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.HIDDEN,
        `Expected hidden for: ${sample}`);
    }
  });

  it('all text samples classified as text', () => {
    for (const sample of textSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.TEXT,
        `Expected text for: ${sample}`);
    }
  });

  it('all hidden chrome samples classified as hidden', () => {
    for (const sample of hiddenChromeSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.HIDDEN,
        `Expected hidden for: ${sample}`);
    }
  });

  it('all GSD banner samples classified as stage_banner', () => {
    for (const sample of gsdBannerSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.STAGE_BANNER,
        `Expected stage_banner for: ${sample}`);
    }
  });

  it('text samples not caught by STAGE_BANNER patterns', () => {
    for (const sample of textSamples) {
      const result = classifyLine(sample);
      assert.notEqual(result.msg_type, MESSAGE_TYPES.STAGE_BANNER,
        `False positive stage_banner for: ${sample}`);
    }
  });

  it('text samples not false-positive matched by new HIDDEN patterns', () => {
    for (const sample of textSamples) {
      const result = classifyLine(sample);
      assert.equal(result.msg_type, MESSAGE_TYPES.TEXT,
        `False positive: ${sample} classified as ${result.msg_type}`);
    }
  });
});
