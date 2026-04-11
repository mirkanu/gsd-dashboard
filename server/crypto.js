// AES-256-GCM field-level encryption for credential storage.
//
// Master key is derived from `process.env.DASHBOARD_SECRET_KEY` via SHA-256.
// Ciphertext, IV, and auth tag are stored as base64 strings in `app_settings`.
//
// Consumers: Phase 45 service cost routes, Phase 46 API integrations (Railway,
// OpenAI admin, Vercel). See `.planning/phases/45-*/45-CONTEXT.md`.

const nodeCrypto = require("node:crypto");
const { db } = require("./db");

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function getKey() {
  const raw = process.env.DASHBOARD_SECRET_KEY;
  if (!raw) {
    throw new Error(
      "DASHBOARD_SECRET_KEY not set — cannot encrypt/decrypt credentials. " +
        "Set it in your environment (Railway variables or local .env)."
    );
  }
  return nodeCrypto.createHash("sha256").update(raw).digest(); // 32 bytes
}

function encryptField(plaintext) {
  if (typeof plaintext !== "string") {
    throw new TypeError("encryptField expects a string");
  }
  const key = getKey();
  const iv = nodeCrypto.randomBytes(IV_BYTES);
  const cipher = nodeCrypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    value_encrypted: ct.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: tag.toString("base64"),
  };
}

function decryptField({ value_encrypted, iv, auth_tag }) {
  const key = getKey();
  const ivBuf = Buffer.from(iv, "base64");
  const ctBuf = Buffer.from(value_encrypted, "base64");
  const tagBuf = Buffer.from(auth_tag, "base64");
  const decipher = nodeCrypto.createDecipheriv(ALGO, key, ivBuf);
  decipher.setAuthTag(tagBuf);
  const pt = Buffer.concat([decipher.update(ctBuf), decipher.final()]);
  return pt.toString("utf8");
}

// Prepared statements — the schema is owned by server/db.js (Plan 01 migration).
const upsertSecretStmt = db.prepare(`
  INSERT INTO app_settings (key, value_encrypted, iv, auth_tag, is_secret, updated_at)
  VALUES (?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(key) DO UPDATE SET
    value_encrypted = excluded.value_encrypted,
    iv = excluded.iv,
    auth_tag = excluded.auth_tag,
    updated_at = excluded.updated_at
`);
const selectSecretStmt = db.prepare("SELECT * FROM app_settings WHERE key = ?");
const listSecretKeysStmt = db.prepare(
  "SELECT key, is_secret, updated_at FROM app_settings WHERE is_secret = 1 ORDER BY key"
);

function setSecret(key, plaintext) {
  const { value_encrypted, iv, auth_tag } = encryptField(plaintext);
  upsertSecretStmt.run(key, value_encrypted, iv, auth_tag);
}

function getSecret(key) {
  const row = selectSecretStmt.get(key);
  if (!row) return null;
  try {
    return decryptField(row);
  } catch (e) {
    console.error(`[crypto] decrypt failed for key=${key}: ${e.message}`);
    return null;
  }
}

function listSecretKeys() {
  return listSecretKeysStmt.all();
}

module.exports = {
  encryptField,
  decryptField,
  getSecret,
  setSecret,
  listSecretKeys,
};
