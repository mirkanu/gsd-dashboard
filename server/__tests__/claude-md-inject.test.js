'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// NOTE: injectStackSection is implemented in Plan 03. These tests are stubs
// that verify the function exists and behaves correctly once implemented.
// Run passing state: Plans 01-02 these will error on require; that is expected.
// Plan 03 provides the implementation.

const TEMP_CLAUDE_MD = path.join(os.tmpdir(), `claude-md-test-${Date.now()}.md`);

describe('claudeMdInject', () => {
  afterEach(() => {
    try { fs.unlinkSync(TEMP_CLAUDE_MD); } catch {}
  });

  it('INJECT-01: creates ## Stack section when no markers present', async (t) => {
    t.todo('injectStackSection not yet implemented — wire in Plan 03');
  });

  it('INJECT-02: replaces existing section between markers (idempotent re-run)', async (t) => {
    t.todo('injectStackSection not yet implemented — wire in Plan 03');
  });

  it('INJECT-03: appends to end of file when no markers present', async (t) => {
    t.todo('injectStackSection not yet implemented — wire in Plan 03');
  });
});
