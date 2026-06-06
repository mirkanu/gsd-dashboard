const { Router } = require("express");

const router = Router();
const UMAMI_BASE = process.env.UMAMI_INTERNAL_URL || "http://localhost:3007";

// Cache token in memory — re-authenticate on 401
let _cachedToken = null;

async function getToken() {
  const password = process.env.UMAMI_ADMIN_PASSWORD;
  if (!password) throw new Error("UMAMI_ADMIN_PASSWORD not set");
  const resp = await fetch(`${UMAMI_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Umami auth failed: ${resp.status}`);
  const { token } = await resp.json();
  _cachedToken = token;
  return token;
}

async function umamiGet(path, retried = false) {
  const token = _cachedToken || (await getToken());
  const resp = await fetch(`${UMAMI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (resp.status === 401 && !retried) {
    _cachedToken = null;
    return umamiGet(path, true);
  }
  if (!resp.ok) throw new Error(`Umami API error: ${resp.status} ${path}`);
  return resp.json();
}

// GET /api/umami/websites
// Returns: [{ id, name, domain }] — subset only, never full Umami response
router.get("/websites", async (_req, res) => {
  if (!process.env.UMAMI_ADMIN_PASSWORD) {
    return res.status(503).json({ error: "UMAMI_ADMIN_PASSWORD not configured" });
  }
  try {
    const data = await umamiGet("/api/websites?pageSize=100");
    // Umami v2 wraps in { data: [...] }
    const websites = Array.isArray(data) ? data : (data.data ?? []);
    if (data.count && websites.length < data.count) {
      console.warn(`[umami] truncated: got ${websites.length} of ${data.count} websites (pageSize=100)`);
    }
    return res.json(
      websites.map(({ id, name, domain }) => ({ id, name, domain }))
    );
  } catch (err) {
    console.error("[umami] /websites error:", err.message);
    return res.status(502).json({ error: "Could not reach Umami" });
  }
});

// GET /api/umami/stats?websiteId=X&startAt=N&endAt=N
// Returns: { pageviews: [{ x: date, y: count }], sessions: [...] }
// x values are ISO date strings (YYYY-MM-DD), y values are integers
router.get("/stats", async (req, res) => {
  if (!process.env.UMAMI_ADMIN_PASSWORD) {
    return res.status(503).json({ error: "UMAMI_ADMIN_PASSWORD not configured" });
  }

  const { websiteId, startAt, endAt } = req.query;

  // Validate inputs — startAt and endAt must be integer timestamps
  if (!websiteId || typeof websiteId !== "string" || !/^[\w-]+$/.test(websiteId)) {
    return res.status(400).json({ error: "Invalid websiteId" });
  }
  const start = parseInt(startAt, 10);
  const end = parseInt(endAt, 10);
  if (isNaN(start) || isNaN(end) || start >= end) {
    return res.status(400).json({ error: "startAt and endAt must be valid integer timestamps with startAt < endAt" });
  }

  try {
    const rangeDays = (end - start) / 86400000;
    const unit = rangeDays <= 90 ? "day" : "month";
    const data = await umamiGet(
      `/api/websites/${websiteId}/pageviews?startAt=${start}&endAt=${end}&unit=${unit}&timezone=UTC`
    );
    return res.json(data);
  } catch (err) {
    console.error(`[umami] /stats error for ${websiteId}:`, err.message);
    return res.status(502).json({ error: "Could not reach Umami" });
  }
});

module.exports = router;
