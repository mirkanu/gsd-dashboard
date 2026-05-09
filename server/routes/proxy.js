// Routes proxied through the tunnel to the local machine (where files and SQLite live)
const PROXY_PREFIXES = [
  '/api/sessions',
  '/api/agents',
  '/api/events',
  '/api/stats',
  '/api/analytics',
  '/api/pricing',
  '/api/config',
  '/api/services',
  '/api/app-settings',
  '/api/webhooks',
  '/api/projects', // Phase 51: project creation + import routes
  '/api/env', // Phase 54: global env editor
  '/api/feed',     // Phase 56: Portfolio Feed
];

function createAgentProxy(gsdDataUrl) {
  if (!gsdDataUrl) return (_req, _res, next) => next();

  return async function agentProxy(req, res, next) {
    if (!PROXY_PREFIXES.some((p) => req.path.startsWith(p))) return next();

    const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const upstreamUrl = `${gsdDataUrl}${req.path}${search}`;

    const timeoutMs = req.path.startsWith('/api/projects/create') ? 120000 : 10000;
    const internalHeader = process.env.GSD_INTERNAL_SECRET
      ? { 'x-gsd-internal': process.env.GSD_INTERNAL_SECRET }
      : {};

    const fetchOpts = { signal: AbortSignal.timeout(timeoutMs), method: req.method };
    if (req.method === 'PUT' || req.method === 'POST' || req.method === 'PATCH') {
      fetchOpts.headers = { 'Content-Type': 'application/json', ...internalHeader };
      fetchOpts.body = JSON.stringify(req.body);
    } else {
      if (Object.keys(internalHeader).length) fetchOpts.headers = internalHeader;
    }

    try {
      const upstream = await fetch(upstreamUrl, fetchOpts);
      const contentType = upstream.headers.get('content-type') || 'application/json';
      const body = await upstream.text();
      res.status(upstream.status).set('Content-Type', contentType).send(body);
    } catch (err) {
      res.status(502).json({ error: 'Failed to reach agent data source', detail: err.message });
    }
  };
}

module.exports = { createAgentProxy };
