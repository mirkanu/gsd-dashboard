// Phase 45 Plan 03 — POST /api/webhooks/email (Pipedream inbound).
// Contract: never bounce. Every invocation returns 200 so Pipedream stops
// retrying. Failures are logged + persisted as 'unparsed' cost rows so no
// forwarded billing email is ever silently dropped.

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { db } = require("../db");
const {
  extractMessageId,
  extractOriginalSender,
  extractSubject,
  extractHtml,
  extractDate,
} = require("../lib/pipedream");
// Required as a whole-module object so tests can monkey-patch
// parserModule.parseServiceReceipt at runtime without module-cache shims.
const parserModule = require("../services/email-parser");
const { resolveProjectKey } = require("../services/mapping-resolver");

const insertProcessed = db.prepare(`
  INSERT OR IGNORE INTO processed_emails (message_id, sender, subject, status)
  VALUES (?, ?, ?, 'received')
`);
const updateProcessedStatus = db.prepare(
  `UPDATE processed_emails SET status = ? WHERE message_id = ?`
);
const insertCost = db.prepare(`
  INSERT INTO external_service_costs
    (id, service, cost_period, cost_usd, currency, checked_at, source, project_key, notes, description, message_id, raw_body)
  VALUES (?, ?, 'monthly', ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

router.get("/", (_req, res) => res.json({ status: "ok" }));

router.post("/", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const payload = req.body;
    const messageId = extractMessageId(payload);
    if (!messageId) {
      console.warn("[webhook:email] no message id — skipping");
      return res.json({ received: true, status: "no_message_id" });
    }

    const sender = extractOriginalSender(payload);
    const subject = extractSubject(payload);
    const html = extractHtml(payload);
    const checkedAt = extractDate(payload); // guaranteed ISO

    const ins = insertProcessed.run(messageId, sender, subject);
    if (ins.changes === 0) {
      return res.json({ received: true, status: "duplicate", messageId });
    }

    // Await the async parser BEFORE entering the sync better-sqlite3 transaction.
    let parsed = null;
    try {
      parsed = await parserModule.parseServiceReceipt(html, subject);
    } catch (e) {
      console.error("[webhook:email] parser threw:", e.message);
      parsed = null;
    }

    const writeTx = db.transaction(() => {
      if (parsed) {
        const projectKey = resolveProjectKey({
          sender,
          subject,
          service: parsed.service,
        });
        insertCost.run(
          uuidv4(),
          parsed.service,
          parsed.amount,
          parsed.currency || "USD",
          checkedAt,
          "email",
          projectKey,
          `email:${messageId}`,
          parsed.description || "",
          messageId,
          null
        );
        updateProcessedStatus.run("parsed", messageId);
      } else {
        insertCost.run(
          uuidv4(),
          "Other",
          0,
          "USD",
          checkedAt,
          "unparsed",
          null,
          `email:${messageId}`,
          subject || "",
          messageId,
          html
        );
        updateProcessedStatus.run("unparsed", messageId);
      }
    });
    writeTx();

    return res.json({
      received: true,
      status: parsed ? "parsed" : "unparsed",
      service: parsed ? parsed.service : undefined,
      amount: parsed ? parsed.amount : undefined,
    });
  } catch (e) {
    console.error("[webhook:email] fatal:", e.message);
    return res.json({ received: true, status: "error" });
  }
});

module.exports = router;
