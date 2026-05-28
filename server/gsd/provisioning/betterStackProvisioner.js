'use strict';

const BETTERSTACK_BASE = 'https://uptime.betterstack.com/api/v2';

async function provisionMonitor(projectName, productionUrl) {
  const apiKey = process.env.BETTERSTACK_API_KEY;
  if (!apiKey) throw new Error('BETTERSTACK_API_KEY not configured');

  const response = await fetch(`${BETTERSTACK_BASE}/monitors`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      monitor_name: `gsd-${projectName}`,
      url: productionUrl,
      monitor_type: 'status',
      check_frequency: 300,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`BetterStack provision failed: ${err.errors?.[0]?.title || err.message || response.statusText}`);
  }

  const { data } = await response.json();
  return { monitorId: data.id };
}

async function checkMonitor(projectName) {
  try {
    const apiKey = process.env.BETTERSTACK_API_KEY;
    if (!apiKey) return false;
    const response = await fetch(
      `${BETTERSTACK_BASE}/monitors?search=${encodeURIComponent(`gsd-${projectName}`)}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return false;
    const { data } = await response.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function deleteMonitor(monitorId) {
  const apiKey = process.env.BETTERSTACK_API_KEY;
  if (!apiKey) throw new Error('BETTERSTACK_API_KEY not configured');
  const response = await fetch(`${BETTERSTACK_BASE}/monitors/${monitorId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`BetterStack delete failed: ${response.statusText}`);
  }
}

module.exports = { provisionMonitor, checkMonitor, deleteMonitor };
