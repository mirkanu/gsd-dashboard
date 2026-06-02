'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { injectStackSection, STACK_OPEN, STACK_CLOSE } = require('../gsd/provisioning/claudeMdInjector');

describe('claudeMdInject', () => {
  let tempFile;

  beforeEach(() => {
    tempFile = path.join(os.tmpdir(), `claude-md-test-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tempFile); } catch {}
  });

  it('INJECT-01: appends ## Stack section when no markers present', () => {
    fs.writeFileSync(tempFile, '# My Project\n\nSome existing content.\n');
    injectStackSection(tempFile, 'testproj');
    const result = fs.readFileSync(tempFile, 'utf8');
    assert.ok(result.includes(STACK_OPEN), 'must contain STACK_OPEN marker');
    assert.ok(result.includes(STACK_CLOSE), 'must contain STACK_CLOSE marker');
    assert.ok(result.includes('## Stack (auto-managed)'), 'must contain section heading');
    assert.ok(result.includes('Some existing content.'), 'must preserve existing content');
  });

  it('INJECT-02: replaces existing section between markers (idempotent)', () => {
    const initial = `# My Project\n\n${STACK_OPEN}\n## Stack (auto-managed)\n\nOLD CONTENT\n${STACK_CLOSE}\n\nPost-stack content.\n`;
    fs.writeFileSync(tempFile, initial);
    injectStackSection(tempFile, 'testproj');
    const result = fs.readFileSync(tempFile, 'utf8');
    // Only one STACK_OPEN should exist (not duplicated)
    assert.equal(result.split(STACK_OPEN).length - 1, 1, 'STACK_OPEN marker must appear exactly once');
    assert.ok(!result.includes('OLD CONTENT'), 'old section content must be replaced');
    assert.ok(result.includes('## Stack (auto-managed)'), 'new section heading must be present');
    assert.ok(result.includes('Post-stack content.'), 'content after stack section must be preserved');
  });

  it('INJECT-03: uses correct env var names derived from project name', () => {
    fs.writeFileSync(tempFile, '# Test\n');
    injectStackSection(tempFile, 'testproj');
    const result = fs.readFileSync(tempFile, 'utf8');
    assert.ok(result.includes('TESTPROJ_UMAMI_WEBSITE_ID'), 'must contain correct Umami env var name');
    assert.ok(result.includes('TESTPROJ_SENTRY_DSN'), 'must contain correct Sentry env var name');
    assert.ok(result.includes('gsd-testproj'), 'must contain correct BetterStack/R2 name');
  });
});
