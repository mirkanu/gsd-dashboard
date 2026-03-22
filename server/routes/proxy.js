const AGENT_PREFIXES = [
  '/api/sessions',
  '/api/agents',
  '/api/events',
  '/api/stats',
  '/api/analytics',
];

function createAgentProxy(gsdDataUrl) {
  if (!gsdDataUrl) return (_req, _res, next) => next();

  return async function agentProxy(req, res, next) {
    if (req.method !== 'GET') return next();
    if (!AGENT_PREFIXES.some((p) => req.path.startsWith(p))) return next();

    const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const upstreamUrl = `${gsdDataUrl}${req.path}${search}`;

    try {
      const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(10000) });
      const contentType = upstream.headers.get('content-type') || 'application/json';
      const body = await upstream.text();
      res.status(upstream.status).set('Content-Type', contentType).send(body);
    } catch (err) {
      res.status(502).json({ error: 'Failed to reach agent data source', detail: err.message });
    }
  };
}

module.exports = { createAgentProxy };
