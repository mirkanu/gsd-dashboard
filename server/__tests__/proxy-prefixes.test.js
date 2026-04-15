'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('proxy.prefix: /api/gsd is listed in PROXY_PREFIXES', () => {
  // Read proxy.js as text since the array is not exported
  const proxyFile = path.resolve(__dirname, '../routes/proxy.js');
  const content = fs.readFileSync(proxyFile, 'utf8');

  assert.ok(
    content.includes("'/api/gsd'"),
    "proxy.js PROXY_PREFIXES should include '/api/gsd' — RED until Task 2 adds it"
  );
});
