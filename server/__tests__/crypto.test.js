const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const os = require("os");

// Use an isolated test database and a known secret BEFORE requiring modules.
const TEST_DB = path.join(os.tmpdir(), `dashboard-crypto-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

const PRIOR_SECRET = process.env.DASHBOARD_SECRET_KEY;
process.env.DASHBOARD_SECRET_KEY = "test-secret-for-unit-tests";

const crypto = require("../crypto");
const { encryptField, decryptField, setSecret, getSecret, listSecretKeys } = crypto;

describe("crypto (AES-256-GCM field helpers)", () => {
  after(() => {
    if (PRIOR_SECRET === undefined) {
      delete process.env.DASHBOARD_SECRET_KEY;
    } else {
      process.env.DASHBOARD_SECRET_KEY = PRIOR_SECRET;
    }
  });

  it("round-trip preserves utf-8 including emoji", () => {
    const plaintext = "hello 🔑 world — ümläuts";
    const blob = encryptField(plaintext);
    assert.ok(blob.value_encrypted && blob.iv && blob.auth_tag);
    assert.equal(decryptField(blob), plaintext);
  });

  it("tampered auth_tag throws on decrypt", () => {
    const blob = encryptField("sensitive");
    // Flip one byte of the auth tag (still valid base64 length).
    const buf = Buffer.from(blob.auth_tag, "base64");
    buf[0] = buf[0] ^ 0xff;
    const tampered = { ...blob, auth_tag: buf.toString("base64") };
    assert.throws(() => decryptField(tampered));
  });

  it("wrong DASHBOARD_SECRET_KEY throws on decrypt", () => {
    const blob = encryptField("another-secret");
    const prev = process.env.DASHBOARD_SECRET_KEY;
    process.env.DASHBOARD_SECRET_KEY = "a-different-key";
    try {
      assert.throws(() => decryptField(blob));
    } finally {
      process.env.DASHBOARD_SECRET_KEY = prev;
    }
  });

  it("missing DASHBOARD_SECRET_KEY throws a descriptive error on encrypt", () => {
    const prev = process.env.DASHBOARD_SECRET_KEY;
    delete process.env.DASHBOARD_SECRET_KEY;
    try {
      assert.throws(
        () => encryptField("x"),
        /DASHBOARD_SECRET_KEY/
      );
    } finally {
      process.env.DASHBOARD_SECRET_KEY = prev;
    }
  });

  it("setSecret then getSecret returns plaintext (round-trip through SQLite)", () => {
    const key = `__test_crypto_${Date.now()}`;
    const value = "railway-pat-xyz-🔐";
    setSecret(key, value);
    assert.equal(getSecret(key), value);
  });

  it("getSecret returns null for missing key", () => {
    assert.equal(getSecret("__definitely_not_a_real_key__"), null);
  });

  it("listSecretKeys returns keys without plaintext values", () => {
    const key = `__test_list_${Date.now()}`;
    setSecret(key, "should-not-leak");
    const rows = listSecretKeys();
    const match = rows.find((r) => r.key === key);
    assert.ok(match, "listSecretKeys should include the newly set key");
    assert.equal(match.value_encrypted, undefined);
    assert.equal(match.iv, undefined);
  });
});
