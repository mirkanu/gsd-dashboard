const { Router } = require("express");
const { stmts, db } = require("../db");

const router = Router();

// Calculate cost for a set of token rows against pricing rules
function calculateCost(tokenRows, pricingRules) {
  let totalCost = 0;
  const breakdown = [];

  // Sort by pattern length descending so specific patterns (e.g. claude-opus-4-5%)
  // match before catch-all patterns (e.g. claude-opus-4%)
  const sortedRules = [...pricingRules].sort(
    (a, b) => b.model_pattern.length - a.model_pattern.length
  );

  for (const row of tokenRows) {
    const rule = sortedRules.find((p) => {
      const pattern = p.model_pattern.replace(/%/g, ".*");
      return new RegExp("^" + pattern + "$").test(row.model);
    });

    const rates = rule || {
      input_per_mtok: 0,
      output_per_mtok: 0,
      cache_read_per_mtok: 0,
      cache_write_per_mtok: 0,
    };
    const cost =
      (row.input_tokens / 1e6) * rates.input_per_mtok +
      (row.output_tokens / 1e6) * rates.output_per_mtok +
      (row.cache_read_tokens / 1e6) * rates.cache_read_per_mtok +
      (row.cache_write_tokens / 1e6) * rates.cache_write_per_mtok;

    totalCost += cost;
    breakdown.push({
      model: row.model,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      cache_read_tokens: row.cache_read_tokens,
      cache_write_tokens: row.cache_write_tokens,
      cost: Math.round(cost * 10000) / 10000,
      matched_rule: rule?.model_pattern || null,
    });
  }

  return { total_cost: Math.round(totalCost * 10000) / 10000, breakdown };
}

// GET /api/pricing - List all pricing rules
router.get("/", (_req, res) => {
  const rules = stmts.listPricing.all();
  res.json({ pricing: rules });
});

// PUT /api/pricing - Create or update a pricing rule
router.put("/", (req, res) => {
  const {
    model_pattern,
    display_name,
    input_per_mtok,
    output_per_mtok,
    cache_read_per_mtok,
    cache_write_per_mtok,
  } = req.body;
  if (!model_pattern || !display_name) {
    return res.status(400).json({
      error: { code: "INVALID_INPUT", message: "model_pattern and display_name are required" },
    });
  }

  stmts.upsertPricing.run(
    model_pattern,
    display_name,
    input_per_mtok ?? 0,
    output_per_mtok ?? 0,
    cache_read_per_mtok ?? 0,
    cache_write_per_mtok ?? 0
  );

  const rule = stmts.getPricing.get(model_pattern);
  res.json({ pricing: rule });
});

// DELETE /api/pricing/:pattern - Delete a pricing rule
router.delete("/:pattern", (req, res) => {
  const pattern = decodeURIComponent(req.params.pattern);
  const existing = stmts.getPricing.get(pattern);
  if (!existing) {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Pricing rule not found" } });
  }
  stmts.deletePricing.run(pattern);
  res.json({ ok: true });
});

// GET /api/pricing/cost - Get total cost across all sessions
router.get("/cost", (_req, res) => {
  const allTokens = db
    .prepare(
      "SELECT model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cache_read_tokens) as cache_read_tokens, SUM(cache_write_tokens) as cache_write_tokens FROM token_usage GROUP BY model"
    )
    .all();
  const rules = stmts.listPricing.all();
  const result = calculateCost(allTokens, rules);
  res.json(result);
});

// GET /api/pricing/cost/:sessionId - Get cost for a specific session
router.get("/cost/:sessionId", (req, res) => {
  const tokenRows = stmts.getTokensBySession.all(req.params.sessionId);
  const rules = stmts.listPricing.all();
  const result = calculateCost(tokenRows, rules);
  res.json(result);
});

// GET /api/pricing/window - Cost for today and this week (UTC boundaries)
router.get("/window", (_req, res) => {
  const rules = stmts.listPricing.all();
  const now = new Date();

  // Today midnight UTC
  const todayMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();

  // This week's Monday midnight UTC
  const dow = now.getUTCDay(); // 0=Sun
  const daysFromMonday = (dow + 6) % 7;
  const weekStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday)
  ).toISOString();

  const tokensForWindow = (since) =>
    db
      .prepare(
        `SELECT tu.model,
          SUM(tu.input_tokens + tu.baseline_input) as input_tokens,
          SUM(tu.output_tokens + tu.baseline_output) as output_tokens,
          SUM(tu.cache_read_tokens + tu.baseline_cache_read) as cache_read_tokens,
          SUM(tu.cache_write_tokens + tu.baseline_cache_write) as cache_write_tokens
        FROM token_usage tu
        JOIN sessions s ON tu.session_id = s.id
        WHERE s.started_at >= ?
        GROUP BY tu.model`
      )
      .all(since);

  const dailyResult = calculateCost(tokensForWindow(todayMidnight), rules);
  const weeklyResult = calculateCost(tokensForWindow(weekStart), rules);

  const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  const daysToNextMonday = (7 - daysFromMonday) % 7 || 7;
  const nextMonday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToNextMonday)
  );

  res.json({
    daily: {
      cost: dailyResult.total_cost,
      from: todayMidnight,
      hours_until_reset: Math.round(((nextMidnight - now) / 3600000) * 10) / 10,
    },
    weekly: {
      cost: weeklyResult.total_cost,
      from: weekStart,
      hours_until_reset: Math.round(((nextMonday - now) / 3600000) * 10) / 10,
    },
  });
});

module.exports = router;
