'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('proxy.prefix: /api/gsd is NOT in PROXY_PREFIXES (routes in gsd.js handle their own GSD_DATA_URL forwarding; a blanket prefix would shadow Railway-side routes like /api/gsd/ws-base and break the terminal WS)', () => {
  const proxyFile = path.resolve(__dirname, '../routes/proxy.js');
  const content = fs.readFileSync(proxyFile, 'utf8');

  assert.ok(
    !content.includes("'/api/gsd'"),
    "proxy.js PROXY_PREFIXES must NOT include '/api/gsd' — it would hide /api/gsd/ws-base behind the tunnel and the terminal can't find its wss:// URL"
  );
});
