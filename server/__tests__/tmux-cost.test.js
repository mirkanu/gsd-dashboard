'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// These tests import from ../gsd/costMeasurement which does not exist yet.
// They will be RED (MODULE_NOT_FOUND) until Plan 02 creates it.
const { estimateTmuxCostPerDay, logTmuxCostEstimate } = require('../gsd/costMeasurement');

test('tmux.cost: RSS 4096 MB × $10/GB-month / 30 days ≈ $1.33/day', () => {
  // RSS in bytes: 4096 MB = 4096 * 1024 * 1024 bytes
  const rssBytes = 4096 * 1024 * 1024;
  const costPerDay = estimateTmuxCostPerDay(rssBytes);
  // Expected: (4096 MB / 1024 MB/GB) * $10/GB-month / 30 days = 4 * 10 / 30 ≈ 1.333
  assert.ok(
    Math.abs(costPerDay - 1.333) < 0.01,
    `Expected ~1.33/day, got ${costPerDay}`
  );
});

test('tmux.cost: RSS 0 returns $0.00/day', () => {
  const costPerDay = estimateTmuxCostPerDay(0);
  assert.strictEqual(costPerDay, 0);
});

test('cost.log: logTmuxCostEstimate inserts row into external_service_costs with tmux_cost_estimate prefix', async () => {
  const inserted = [];
  const fakeDb = {
    prepare: () => ({
      run: (...args) => { inserted.push(args); },
    }),
  };

  await logTmuxCostEstimate('test-project', 2048 * 1024 * 1024, { db: fakeDb });

  assert.ok(inserted.length > 0, 'should insert a row');
  // The notes/source column should include tmux_cost_estimate prefix
  const row = inserted[0];
  const rowStr = JSON.stringify(row);
  assert.ok(
    rowStr.includes('tmux_cost_estimate'),
    `Row should include tmux_cost_estimate prefix, got: ${rowStr}`
  );
});
