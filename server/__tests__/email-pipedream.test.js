// Phase 45 Plan 03 — Pipedream helpers + mapping resolver unit tests.
// Parser tests live at the bottom and are skipped when ANTHROPIC_API_KEY is unset.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Isolated test DB (must be set before requiring any module that touches db.js)
const TEST_DB = path.join(os.tmpdir(), `email-pipedream-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

const {
  extractMessageId,
  extractOriginalSender,
  extractSubject,
  extractHtml,
  extractDate,
} = require("../lib/pipedream");

const FIXTURE_DIR = path.join(__dirname, "fixtures", "emails");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), "utf8"));
}

// ---------------------------------------------------------------------------
// Pipedream helpers
// ---------------------------------------------------------------------------

describe("pipedream extractMessageId", () => {
  it("Railway fixture message-id", () => {
    const p = loadFixture("railway");
    assert.equal(extractMessageId(p), "<railway-20260401-1@railway.app>");
  });
  it("OpenAI fixture message-id", () => {
    assert.equal(extractMessageId(loadFixture("openai")), "<openai-20260402-1@openai.com>");
  });
  it("Vercel fixture message-id", () => {
    assert.equal(extractMessageId(loadFixture("vercel")), "<vercel-20260403-1@vercel.com>");
  });
  it("Anthropic fixture message-id", () => {
    assert.equal(extractMessageId(loadFixture("anthropic")), "<anthropic-20260404-1@anthropic.com>");
  });
  it("null-safe: undefined → null", () => {
    assert.equal(extractMessageId(undefined), null);
  });
  it("null-safe: null → null", () => {
    assert.equal(extractMessageId(null), null);
  });
  it("null-safe: empty object → null", () => {
    assert.equal(extractMessageId({}), null);
  });
});

describe("pipedream extractOriginalSender", () => {
  it("Railway fixture sender", () => {
    assert.equal(extractOriginalSender(loadFixture("railway")), "team@railway.app");
  });
  it("OpenAI fixture sender", () => {
    assert.equal(extractOriginalSender(loadFixture("openai")), "receipts@openai.com");
  });
  it("Vercel fixture sender", () => {
    assert.equal(extractOriginalSender(loadFixture("vercel")), "invoice+statements@vercel.com");
  });
  it("Anthropic fixture sender", () => {
    assert.equal(extractOriginalSender(loadFixture("anthropic")), "noreply@anthropic.com");
  });
  it("falls back to from.text when value array missing", () => {
    const p = {
      trigger: { event: { headers: { from: { text: "Foo <foo@bar.com>" } } } },
    };
    assert.equal(extractOriginalSender(p), "Foo <foo@bar.com>");
  });
  it("null-safe: empty object → null", () => {
    assert.equal(extractOriginalSender({}), null);
  });
  it("null-safe: undefined → null", () => {
    assert.equal(extractOriginalSender(undefined), null);
  });
});

describe("pipedream extractSubject", () => {
  it("Railway fixture subject", () => {
    assert.equal(extractSubject(loadFixture("railway")), "Your Railway invoice for April 2026");
  });
  it("null-safe: empty object → null", () => {
    assert.equal(extractSubject({}), null);
  });
});

describe("pipedream extractHtml", () => {
  it("Railway fixture contains $42.17", () => {
    assert.match(extractHtml(loadFixture("railway")), /\$42\.17/);
  });
  it("OpenAI fixture contains $18.90", () => {
    assert.match(extractHtml(loadFixture("openai")), /\$18\.90/);
  });
  it("Vercel fixture contains $20.00", () => {
    assert.match(extractHtml(loadFixture("vercel")), /\$20\.00/);
  });
  it("Anthropic fixture contains $7.55", () => {
    assert.match(extractHtml(loadFixture("anthropic")), /\$7\.55/);
  });
  it("null-safe: empty object → empty string", () => {
    assert.equal(extractHtml({}), "");
  });
  it("null-safe: undefined → empty string", () => {
    assert.equal(extractHtml(undefined), "");
  });
});

describe("pipedream extractDate normalization", () => {
  it("ISO input → ISO with ms", () => {
    const p = { trigger: { event: { headers: { date: "2026-04-01T10:00:00Z" } } } };
    assert.equal(extractDate(p), "2026-04-01T10:00:00.000Z");
  });
  it("RFC 2822 input → valid ISO", () => {
    const p = {
      trigger: { event: { headers: { date: "Fri, 10 Apr 2026 10:00:00 +0000" } } },
    };
    const result = extractDate(p);
    assert.ok(!Number.isNaN(new Date(result).getTime()), `expected valid ISO, got ${result}`);
    assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
  it("missing date header → returns now (valid ISO)", () => {
    const result = extractDate({});
    assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(!Number.isNaN(new Date(result).getTime()));
  });
  it("garbage input → returns now (valid ISO fallback)", () => {
    const p = { trigger: { event: { headers: { date: "not a date" } } } };
    const result = extractDate(p);
    assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(!Number.isNaN(new Date(result).getTime()));
  });
  it("null input → returns valid ISO", () => {
    const result = extractDate(null);
    assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

// ---------------------------------------------------------------------------
// Mapping resolver — real DB, isolated test rules, cleanup in after()
// ---------------------------------------------------------------------------

const { db } = require("../db");
const { resolveProjectKey } = require("../services/mapping-resolver");

const insertRule = db.prepare(`
  INSERT INTO service_mapping_rules (pattern_type, pattern_value, project_key, service)
  VALUES (?, ?, ?, ?)
`);
const deleteRule = db.prepare(`DELETE FROM service_mapping_rules WHERE id = ?`);

describe("mapping-resolver resolveProjectKey", () => {
  const insertedIds = [];

  after(() => {
    for (const id of insertedIds) {
      try {
        deleteRule.run(id);
      } catch {
        /* ignore */
      }
    }
  });

  it("matches sender rule → returns project_key", () => {
    const info = insertRule.run("sender", "railway.app", "gsddashboard-test", null);
    insertedIds.push(info.lastInsertRowid);
    const key = resolveProjectKey({ sender: "team@railway.app", subject: null, service: null });
    assert.equal(key, "gsddashboard-test");
  });

  it("matches subject_contains rule case-insensitively", () => {
    const info = insertRule.run("subject_contains", "openai", "kidai-test", null);
    insertedIds.push(info.lastInsertRowid);
    const key = resolveProjectKey({
      sender: "forwarder@me.com",
      subject: "Your OpenAI Receipt",
      service: null,
    });
    assert.equal(key, "kidai-test");
  });

  it("no matching rule → null", () => {
    const key = resolveProjectKey({
      sender: "unknown@nowhere.com",
      subject: "Some random subject",
      service: null,
    });
    assert.equal(key, null);
  });

  it("sender matching is case-insensitive", () => {
    const key = resolveProjectKey({
      sender: "Team@Railway.APP",
      subject: null,
      service: null,
    });
    assert.equal(key, "gsddashboard-test");
  });

  it("service filter excludes rules that target a different service", () => {
    const info = insertRule.run("sender", "railway.app", "other-project", "Railway");
    insertedIds.push(info.lastInsertRowid);
    // When resolver is called with service='OpenAI', the Railway-scoped rule should be skipped.
    // The un-scoped rule from first test (project_key='gsddashboard-test') still matches by sender.
    const key = resolveProjectKey({
      sender: "team@railway.app",
      subject: null,
      service: "OpenAI",
    });
    assert.equal(key, "gsddashboard-test");
  });
});

// ---------------------------------------------------------------------------
// Parser smoke test — skipped if no ANTHROPIC_API_KEY
// ---------------------------------------------------------------------------

const { parseServiceReceipt } = require("../services/email-parser");

const parserTest = process.env.ANTHROPIC_API_KEY ? it : it.skip;

describe("email-parser parseServiceReceipt", () => {
  parserTest("extracts Railway amount from fixture", async () => {
    const p = loadFixture("railway");
    const html = p.trigger.event.body.html;
    const subject = p.trigger.event.headers.subject;
    const result = await parseServiceReceipt(html, subject);
    assert.ok(result, "parser returned null");
    assert.ok(result.amount >= 40 && result.amount <= 50, `amount out of range: ${result.amount}`);
    assert.match(result.service, /railway/i);
  });
});
