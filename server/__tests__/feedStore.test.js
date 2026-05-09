'use strict';

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

// Will be imported after module exists
let feedStore;
let extractLandmarkEvent;

describe('feedStore', () => {
  before(() => {
    feedStore = require('../gsd/feedStore');
    const tmux = require('../gsd/tmux');
    extractLandmarkEvent = tmux.extractLandmarkEvent;
  });

  beforeEach(() => {
    feedStore._resetEvents();
  });

  // Test 1: pushEvent adds an entry with id
  it('pushEvent adds entry with id and getEvents returns it', () => {
    const now = new Date().toISOString();
    feedStore.pushEvent({ type: 'plan_complete', projectName: 'p', projectDisplayName: 'P', label: 'l', detectedAt: now });
    const events = feedStore.getEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'plan_complete');
    assert.equal(events[0].projectName, 'p');
    assert.equal(events[0].label, 'l');
    assert.ok(typeof events[0].id === 'string', 'id should be a string UUID');
  });

  // Test 2: caps at 200
  it('after 201 pushEvents, getEvents().length === 200 (cap enforced)', () => {
    const now = new Date().toISOString();
    for (let i = 0; i < 201; i++) {
      feedStore.pushEvent({ type: 'plan_complete', projectName: 'p', projectDisplayName: 'P', label: `l${i}`, detectedAt: now });
    }
    assert.equal(feedStore.getEvents().length, 200);
  });

  // Test 3: newest first
  it('getEvents() returns newest first (most recently pushed at index 0)', () => {
    const now = new Date().toISOString();
    feedStore.pushEvent({ type: 'plan_complete', projectName: 'p', projectDisplayName: 'P', label: 'first', detectedAt: now });
    feedStore.pushEvent({ type: 'verify_passed', projectName: 'p', projectDisplayName: 'P', label: 'second', detectedAt: now });
    const events = feedStore.getEvents();
    assert.equal(events[0].label, 'second');
    assert.equal(events[1].label, 'first');
  });

  // Test 4: _resetEvents clears store
  it('_resetEvents() clears the store → getEvents() returns []', () => {
    const now = new Date().toISOString();
    feedStore.pushEvent({ type: 'plan_complete', projectName: 'p', projectDisplayName: 'P', label: 'l', detectedAt: now });
    feedStore._resetEvents();
    assert.deepEqual(feedStore.getEvents(), []);
  });
});

describe('extractLandmarkEvent', () => {
  before(() => {
    if (!extractLandmarkEvent) {
      const tmux = require('../gsd/tmux');
      extractLandmarkEvent = tmux.extractLandmarkEvent;
    }
  });

  // Test 5: plan_complete detection
  it('text containing "SUMMARY.md written" → returns plan_complete event', () => {
    const text = 'Some output\nSUMMARY.md written\nDone';
    const result = extractLandmarkEvent(text, 'TestProject');
    assert.ok(result !== null, 'should not be null');
    assert.equal(result.type, 'plan_complete');
    assert.equal(result.projectName, 'TestProject');
    assert.equal(result.label, 'Finished a plan on TestProject');
    assert.ok(typeof result.detectedAt === 'string');
  });

  // Test 6: verify_passed detection (case insensitive)
  it('text containing "verify passed" (case insensitive) → returns verify_passed event', () => {
    const text = 'Running verify...\nVerify passed on TestProject\nAll good';
    const result = extractLandmarkEvent(text, 'TestProject');
    assert.ok(result !== null);
    assert.equal(result.type, 'verify_passed');
  });

  // Test 7: verify_failed detection
  it('text containing "tests failed" → returns verify_failed event', () => {
    const text = 'Running tests...\n3 tests failed\nFix required';
    const result = extractLandmarkEvent(text, 'TestProject');
    assert.ok(result !== null);
    assert.equal(result.type, 'verify_failed');
  });

  // Test 8: phase_complete detection
  it('text containing "phase 3 complete" → returns phase_complete event', () => {
    const text = 'Wrapping up\nPhase 3 complete\n';
    const result = extractLandmarkEvent(text, 'TestProject');
    assert.ok(result !== null);
    assert.equal(result.type, 'phase_complete');
  });

  // Test 9: no match returns null
  it('text containing "hello world" (no patterns) → returns null', () => {
    const text = 'hello world\nnothing special here';
    const result = extractLandmarkEvent(text, 'TestProject');
    assert.equal(result, null);
  });

  // Test 10: null/undefined input returns null
  it('null/undefined input → returns null', () => {
    assert.equal(extractLandmarkEvent(null, 'TestProject'), null);
    assert.equal(extractLandmarkEvent(undefined, 'TestProject'), null);
  });
});
