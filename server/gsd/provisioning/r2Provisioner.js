'use strict';

function getCloudflareHeaders() {
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  const email = process.env.CLOUDFLARE_EMAIL;
  if (!apiKey || !email) throw new Error('CLOUDFLARE_API_KEY or CLOUDFLARE_EMAIL not configured');
  return { 'X-Auth-Key': apiKey, 'X-Auth-Email': email, 'Content-Type': 'application/json' };
}

function getAccountId() {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id) throw new Error('CLOUDFLARE_ACCOUNT_ID not configured');
  return id;
}

function bucketName(projectName) {
  return `gsd-${projectName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

async function createBucket(projectName) {
  const headers = getCloudflareHeaders();
  const accountId = getAccountId();
  const name = bucketName(projectName);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
    { method: 'POST', headers, body: JSON.stringify({ name }), signal: AbortSignal.timeout(10000) }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`R2 bucket creation failed: ${err.errors?.[0]?.message || err.message || response.statusText}`);
  }

  const { result } = await response.json();
  return { bucketName: result?.name ?? name };
}

async function checkBucket(projectName) {
  try {
    const headers = getCloudflareHeaders();
    const accountId = getAccountId();
    const name = bucketName(projectName);
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${name}`,
      { headers, signal: AbortSignal.timeout(10000) }
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function deleteBucket(bucketNameArg) {
  const headers = getCloudflareHeaders();
  const accountId = getAccountId();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketNameArg}`,
    { method: 'DELETE', headers, signal: AbortSignal.timeout(10000) }
  );
  if (!response.ok) throw new Error(`R2 bucket delete failed: ${response.statusText}`);
}

module.exports = { createBucket, checkBucket, deleteBucket, bucketName };
