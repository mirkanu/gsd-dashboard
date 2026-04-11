// Phase 45 Plan 03 — applies service_mapping_rules to a parsed receipt.
// First-match-wins, ordered id DESC so latest user-added rules take precedence.

const { db } = require("../db");

const listRulesStmt = db.prepare(
  "SELECT id, pattern_type, pattern_value, project_key, service FROM service_mapping_rules ORDER BY id DESC"
);

/**
 * @param {{sender:?string, subject:?string, service:?string}} input
 * @returns {string|null} project_key or null when no rule matches.
 */
function resolveProjectKey({ sender, subject, service }) {
  const rules = listRulesStmt.all();
  const s = (sender || "").toLowerCase();
  const sub = (subject || "").toLowerCase();

  for (const rule of rules) {
    // Optional service filter — if the rule scopes itself to a service, skip
    // unless the caller provided a matching service.
    if (rule.service && service && rule.service.toLowerCase() !== service.toLowerCase()) {
      continue;
    }
    const needle = (rule.pattern_value || "").toLowerCase();
    if (!needle) continue;
    if (rule.pattern_type === "sender" && s.includes(needle)) return rule.project_key;
    if (rule.pattern_type === "subject_contains" && sub.includes(needle)) return rule.project_key;
  }
  return null;
}

module.exports = { resolveProjectKey };
