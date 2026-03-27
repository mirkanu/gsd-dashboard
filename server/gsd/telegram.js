'use strict';

const { execFileSync } = require('child_process');
const { isTmuxSessionActive } = require('./tmux');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ENABLED = !!(BOT_TOKEN && CHAT_ID);
const API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

let pollerAbort = null; // AbortController for stopping the poller
let stmts = null; // lazy-loaded from db.js to avoid circular deps

const notifyCooldowns = new Map(); // project → timestamp
const COOLDOWN_MS = 60_000; // 1 minute between notifications per project

/**
 * Check whether a notification should be sent for this project (cooldown gate).
 * Returns true if allowed, false if within cooldown window.
 */
function shouldNotify(projectName) {
  const last = notifyCooldowns.get(projectName) || 0;
  if (Date.now() - last < COOLDOWN_MS) return false;
  notifyCooldowns.set(projectName, Date.now());
  return true;
}

/**
 * Parse options from terminal output text.
 * Pattern 1: "select: A / B / C" → ['A', 'B', 'C']
 * Pattern 2: trailing numbered list "1. Option" or "1) Option" → ['Option', ...]
 */
function parseOptions(text) {
  if (!text) return [];

  // Pattern 1: "select: A / B / C"
  const selectMatch = text.match(/\bselect:\s*(.+)/i);
  if (selectMatch) {
    const parts = selectMatch[1].split('/').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.every(p => p.length <= 40)) return parts;
  }

  // Pattern 2: trailing numbered list
  const lines = text.trim().split('\n');
  const numbered = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^\s*\d+[.)]\s+(.+)/);
    if (m) numbered.unshift(m[1].trim());
    else break;
  }
  if (numbered.length >= 2) return numbered.slice(0, 8);

  return [];
}

function getStmts() {
  if (!stmts) {
    try { stmts = require('../db').stmts; } catch { /* not available */ }
  }
  return stmts;
}

/**
 * Call Telegram Bot API. Returns parsed JSON or null on error.
 */
async function apiCall(method, payload) {
  try {
    const res = await fetch(`${API_BASE}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Send a notification to Telegram.
 * @param {string} projectName
 * @param {string} text
 * @param {string[]} [options] - optional inline keyboard buttons
 */
async function sendNotification(projectName, text, options) {
  if (!ENABLED) return;
  const MAX_LEN = 3800;
  let msg = `[${projectName}] ${text}`;
  if (msg.length > MAX_LEN) msg = '...\n' + msg.slice(-MAX_LEN);

  const payload = { chat_id: CHAT_ID, text: msg };
  if (options && options.length > 0) {
    payload.reply_markup = {
      inline_keyboard: options.map(opt => [{ text: opt, callback_data: opt }]),
    };
  }
  await apiCall('sendMessage', payload);
  try { getStmts()?.insertGsdMessage?.run(projectName, 'outbound', `[Telegram] ${text}`); } catch { /* non-blocking */ }
}

/**
 * Extract project name from "[name] ..." message prefix.
 */
function extractProject(text) {
  if (!text) return null;
  const m = text.match(/^\[([^\]]+)\]/);
  return m ? m[1] : null;
}

/**
 * Inject text into a tmux session. Returns true on success.
 */
function injectTmux(sessionName, text) {
  if (!isTmuxSessionActive(sessionName)) return false;
  try {
    execFileSync('tmux', ['send-keys', '-t', sessionName, text, 'Enter'], { stdio: 'ignore', timeout: 5000 });
    // Log inbound message
    try { getStmts()?.insertGsdMessage?.run(sessionName, 'inbound', text); } catch { /* non-blocking */ }
    return true;
  } catch {
    return false;
  }
}

/**
 * Start the reply poller (long-polling loop).
 */
function startReplyPoller() {
  if (!ENABLED) return;
  const abort = new AbortController();
  pollerAbort = abort;

  (async () => {
    let offset = 0;
    console.log('[telegram] Reply poller started.');
    while (!abort.signal.aborted) {
      try {
        const url = `${API_BASE}/getUpdates?offset=${offset}&timeout=30`;
        const res = await fetch(url, { signal: abort.signal });
        const data = await res.json();
        const updates = data.result || [];

        for (const update of updates) {
          offset = update.update_id + 1;
          try {
            if (update.callback_query) {
              // Inline keyboard button press
              const cq = update.callback_query;
              const chatId = cq.message?.chat?.id;
              if (String(chatId) !== String(CHAT_ID)) continue;

              const project = extractProject(cq.message?.text || '');
              if (cq.id) await apiCall('answerCallbackQuery', { callback_query_id: cq.id });
              if (project) injectTmux(project, cq.data || '');
            } else if (update.message) {
              // Free-text reply
              const msg = update.message;
              if (String(msg.chat?.id) !== String(CHAT_ID)) continue;

              const replyText = msg.reply_to_message?.text || '';
              let project = extractProject(replyText);
              if (!project) project = extractProject(msg.text || '');
              if (project) injectTmux(project, msg.text || '');
            }
          } catch (e) {
            console.error('[telegram] Error handling update:', e.message);
          }
        }
      } catch (e) {
        if (abort.signal.aborted) break;
        console.error('[telegram] Poll error:', e.message);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    console.log('[telegram] Reply poller stopped.');
  })();
}

/**
 * Stop the reply poller.
 */
function stopReplyPoller() {
  if (pollerAbort) {
    pollerAbort.abort();
    pollerAbort = null;
  }
}

module.exports = { sendNotification, parseOptions, shouldNotify, startReplyPoller, stopReplyPoller, ENABLED };
