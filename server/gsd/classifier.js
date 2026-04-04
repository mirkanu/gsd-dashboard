'use strict';

const { capturePaneText } = require('./tmux');

/**
 * TmuxClassifier — polls active tmux sessions, diffs output, classifies chunks,
 * persists visible messages to gsd_messages, and broadcasts via WebSocket.
 */
class TmuxClassifier {
  /**
   * @param {object} stmts - Prepared statements from db.js (needs insertClassifiedMessage)
   * @param {function} broadcast - WebSocket broadcast(type, data)
   * @param {import('./patternManager').PatternManager} patternManager - Three-tier classifier
   */
  constructor(stmts, broadcast, patternManager) {
    this.stmts = stmts;
    this.broadcast = broadcast;
    this.patternManager = patternManager;
    /** @type {Map<string, string[]>} previous capture-pane lines per project */
    this.snapshots = new Map();
  }

  /**
   * Poll a single project's tmux session for new output.
   * @param {string} projectName
   * @param {string} tmuxSession
   */
  poll(projectName, tmuxSession) {
    const text = capturePaneText(tmuxSession);
    if (!text) return;

    const currentLines = text.split('\n');
    const prevLines = this.snapshots.get(projectName) || [];

    const newContent = this.diffLines(prevLines, currentLines);
    if (!newContent) return;

    // Update snapshot
    this.snapshots.set(projectName, currentLines);

    const chunks = this.patternManager.classifyChunks(newContent);
    // Filter out hidden messages
    const visible = chunks.filter(c => c.msg_type !== 'hidden');
    // Group consecutive text messages
    const grouped = this.groupConsecutiveText(visible);

    for (const chunk of grouped) {
      const metaJson = chunk.metadata ? JSON.stringify(chunk.metadata) : null;
      const result = this.stmts.insertClassifiedMessage.run(
        projectName,
        'inbound',
        chunk.content,
        chunk.msg_type,
        metaJson
      );

      const message = {
        id: Number(result.lastInsertRowid),
        project: projectName,
        direction: 'inbound',
        content: chunk.content,
        message_type: chunk.msg_type,
        metadata: chunk.metadata,
        created_at: new Date().toISOString(),
      };

      this.broadcast('gsd_chat_message', { project: projectName, message });
    }
  }

  /**
   * Find new lines by comparing previous snapshot to current.
   * @param {string[]} prevLines
   * @param {string[]} currentLines
   * @returns {string|null} new content joined with newlines, or null if none
   */
  diffLines(prevLines, currentLines) {
    if (!prevLines || prevLines.length === 0) {
      return currentLines.join('\n');
    }

    // Find where prevLines ends in currentLines by matching the last few lines
    const overlapSize = Math.min(3, prevLines.length);
    const needle = prevLines.slice(-overlapSize);

    // Walk backward through currentLines to find the overlap point
    for (let i = currentLines.length - overlapSize; i >= 0; i--) {
      let match = true;
      for (let j = 0; j < overlapSize; j++) {
        if (currentLines[i + j] !== needle[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        const afterOverlap = currentLines.slice(i + overlapSize);
        if (afterOverlap.length === 0) return null;
        return afterOverlap.join('\n');
      }
    }

    // No overlap found (fast scroll) — return all current lines
    return currentLines.join('\n');
  }

  /**
   * Group consecutive text chunks into single messages.
   * Non-text types always break groups.
   * @param {Array<{msg_type: string, content: string, metadata: null}>} chunks
   * @returns {Array<{msg_type: string, content: string, metadata: null}>}
   */
  groupConsecutiveText(chunks) {
    if (chunks.length === 0) return [];

    const result = [];
    let textAccum = null;

    for (const chunk of chunks) {
      if (chunk.msg_type === 'text') {
        if (textAccum) {
          textAccum.content += '\n' + chunk.content;
        } else {
          textAccum = { ...chunk };
        }
      } else {
        // Non-text: flush any accumulated text first
        if (textAccum) {
          result.push(textAccum);
          textAccum = null;
        }
        result.push(chunk);
      }
    }

    // Flush remaining text
    if (textAccum) {
      result.push(textAccum);
    }

    return result;
  }
}

module.exports = { TmuxClassifier };
