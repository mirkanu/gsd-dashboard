// Phase 45 Plan 03 — Claude Haiku-backed email receipt parser.
// Returns null on any failure so the webhook route can fall back to an
// unparsed row and never drop data.

const Anthropic = require("@anthropic-ai/sdk");

/**
 * @param {string} html   Raw HTML body from the forwarded billing email.
 * @param {string} subject Subject line (provides extra signal to the model).
 * @returns {Promise<{amount:number,service:string,currency:string,date:string,description:string}|null>}
 */
async function parseServiceReceipt(html, subject) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[email-parser] ANTHROPIC_API_KEY not set — cannot parse");
    return null;
  }
  try {
    const client = new Anthropic();
    const today = new Date().toISOString().slice(0, 10);
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system:
        "You are a data extraction assistant. Extract service billing info from receipt/invoice emails. Return ONLY valid JSON with no markdown, no explanation.",
      messages: [
        {
          role: "user",
          content:
            `Extract the total amount charged, the service name (Railway, OpenAI, Anthropic, Vercel, or Other), the currency (3-letter ISO, default "USD"), the invoice/charge date, and a brief description from this billing email.\n` +
            `Date format: YYYY-MM-DD. If no date found, use today: ${today}.\n` +
            `Return JSON: {"amount": 12.34, "service": "Railway", "currency": "USD", "date": "2026-04-01", "description": "April 2026 usage"}\n\n` +
            `Subject: ${subject || ""}\n\nHTML:\n${html}`,
        },
      ],
    });

    const txt = msg.content?.[0];
    if (!txt || txt.type !== "text") return null;

    let raw = txt.text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    }

    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.amount !== "number" ||
      typeof parsed.service !== "string" ||
      typeof parsed.date !== "string"
    ) {
      return null;
    }

    return {
      amount: parsed.amount,
      service: parsed.service,
      currency: typeof parsed.currency === "string" ? parsed.currency : "USD",
      date: parsed.date,
      description: typeof parsed.description === "string" ? parsed.description : "",
    };
  } catch (e) {
    console.error("[email-parser] failed:", e.message);
    return null;
  }
}

module.exports = { parseServiceReceipt };
