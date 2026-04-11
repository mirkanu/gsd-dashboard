// Phase 45 Plan 03 — Pipedream payload helpers.
// Pure functions, no throws, defensive optional chaining.
// Ported from /data/home/ynab/src/lib/email.ts (see 45-CONTEXT.md).

function extractMessageId(payload) {
  try {
    const mid = payload?.trigger?.event?.headers?.["message-id"];
    return typeof mid === "string" && mid.length > 0 ? mid : null;
  } catch {
    return null;
  }
}

function extractOriginalSender(payload) {
  try {
    const h = payload?.trigger?.event?.headers?.from;
    if (!h) return null;
    const addr = h.value?.[0]?.address;
    if (typeof addr === "string" && addr.length > 0) return addr;
    if (typeof h.text === "string" && h.text.length > 0) return h.text.trim();
    return null;
  } catch {
    return null;
  }
}

function extractSubject(payload) {
  try {
    const s = payload?.trigger?.event?.headers?.subject;
    return typeof s === "string" && s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

function extractHtml(payload) {
  try {
    const h = payload?.trigger?.event?.body?.html;
    return typeof h === "string" ? h : "";
  } catch {
    return "";
  }
}

// ALWAYS returns a valid ISO-8601 string. Header date may be RFC 2822 or ISO.
// Normalizes via Date; falls back to current time on any failure.
function extractDate(payload) {
  try {
    const raw = payload?.trigger?.event?.headers?.date;
    if (typeof raw === "string" && raw.length > 0) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  } catch {
    /* fall through */
  }
  return new Date().toISOString();
}

module.exports = {
  extractMessageId,
  extractOriginalSender,
  extractSubject,
  extractHtml,
  extractDate,
};
