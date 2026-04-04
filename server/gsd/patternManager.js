'use strict';

const stripAnsi = require('strip-ansi');
const { classifyLine: staticClassifyLine } = require('./classifierPatterns');

/**
 * PatternManager — Three-tier classification: DB overrides > static patterns > default text.
 *
 * Hot-reloads overrides from SQLite on startup and keeps an in-memory cache
 * that is updated on add/disable so no restart is needed.
 */
class PatternManager {
  /**
   * @param {import('better-sqlite3').Database} db - Raw better-sqlite3 instance
   */
  constructor(db) {
    this.db = db;
    /** @type {Array<{id: number, pattern: string, regex: RegExp, target_type: string, priority: number}>} */
    this.overrides = [];
    // Hot-path prepared statement for bumping hit counts (kept on instance, not shared stmts)
    this._bumpHit = db.prepare('UPDATE classifier_overrides SET hit_count = hit_count + 1 WHERE id = ?');
    this.loadOverrides();
  }

  /**
   * Load all enabled overrides from DB, compile regex, sort by priority DESC, id DESC.
   */
  loadOverrides() {
    const rows = this.db.prepare(
      'SELECT * FROM classifier_overrides WHERE enabled = 1 ORDER BY priority DESC, id DESC'
    ).all();
    this.overrides = rows.map(row => ({
      id: row.id,
      pattern: row.pattern,
      regex: new RegExp(row.pattern),
      target_type: row.target_type,
      priority: row.priority,
    }));
  }

  /**
   * Classify a single line through three tiers.
   * Tier 1: DB overrides (regex match, bump hit count)
   * Tier 2+3: Static patterns + default text (delegated to classifierPatterns.classifyLine)
   *
   * @param {string} rawLine
   * @returns {{ msg_type: string, content: string, metadata: null } | null}
   */
  classifyLine(rawLine) {
    const clean = stripAnsi(rawLine).trim();
    if (!clean) return null;

    // Tier 1: check overrides
    for (const override of this.overrides) {
      if (override.regex.test(clean)) {
        // Non-blocking hit count bump
        try { this._bumpHit.run(override.id); } catch { /* non-blocking */ }
        return { msg_type: override.target_type, content: clean, metadata: null };
      }
    }

    // Tier 2+3: delegate to static classifier (handles static patterns + default text)
    return staticClassifyLine(rawLine);
  }

  /**
   * Classify multi-line text through classifyLine, filtering nulls.
   * @param {string} rawText
   * @returns {Array<{ msg_type: string, content: string, metadata: null }>}
   */
  classifyChunks(rawText) {
    return rawText
      .split('\n')
      .map(line => this.classifyLine(line))
      .filter(Boolean);
  }

  /**
   * Add a new override to DB and in-memory cache.
   * @param {string} pattern - Regex string
   * @param {string} targetType - Target message type
   * @param {number|null} feedbackId - Associated feedback row ID
   * @returns {number} New override ID
   */
  addOverride(pattern, targetType, feedbackId) {
    const result = this.db.prepare(
      'INSERT INTO classifier_overrides (pattern, target_type, feedback_id) VALUES (?, ?, ?)'
    ).run(pattern, targetType, feedbackId);
    const id = Number(result.lastInsertRowid);

    // Prepend to in-memory cache (newest first at same priority)
    this.overrides.unshift({
      id,
      pattern,
      regex: new RegExp(pattern),
      target_type: targetType,
      priority: 0,
    });

    return id;
  }

  /**
   * Disable an override in DB and remove from in-memory cache.
   * @param {number} id
   */
  disableOverride(id) {
    this.db.prepare('UPDATE classifier_overrides SET enabled = 0 WHERE id = ?').run(id);
    this.overrides = this.overrides.filter(o => o.id !== id);
  }

  /**
   * Check if any enabled override already matches content with the same target type.
   * @param {string} content
   * @param {string} targetType
   * @returns {object|null} The matching override or null
   */
  findExistingOverride(content, targetType) {
    const clean = stripAnsi(content).trim();
    for (const override of this.overrides) {
      if (override.target_type === targetType && override.regex.test(clean)) {
        return override;
      }
    }
    return null;
  }

  /**
   * Check if any enabled override matches content with a DIFFERENT target type.
   * @param {string} content
   * @param {string} targetType
   * @returns {object|null} The conflicting override or null
   */
  findConflictingOverride(content, targetType) {
    const clean = stripAnsi(content).trim();
    for (const override of this.overrides) {
      if (override.target_type !== targetType && override.regex.test(clean)) {
        return override;
      }
    }
    return null;
  }

  /**
   * Derive a regex pattern string from content.
   * Takes first line, escapes regex special chars, truncates to 40 chars, anchors to ^.
   * @param {string} content
   * @returns {string} Regex pattern string
   */
  static derivePattern(content) {
    const firstLine = stripAnsi(content).trim().split('\n')[0].trim();
    // Escape regex special characters
    const escaped = firstLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Truncate to 40 chars
    const truncated = escaped.slice(0, 40);
    return '^' + truncated;
  }
}

module.exports = { PatternManager };
