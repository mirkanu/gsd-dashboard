'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { isTmuxSessionActive } = require('./tmux');

// Load .env file if present (server doesn't use dotenv)
try {
  const envPath = path.resolve(__dirname, '../../.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [k, ...rest] = trimmed.split('=');
    if (!process.env[k.trim()]) process.env[k.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
} catch { /* no .env file — rely on real env vars */ }

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ENABLED = !!(BOT_TOKEN && CHAT_ID);
const API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

let pollerAbort = null; // AbortController for stopping the poller
let stmts = null; // lazy-loaded from db.js to avoid circular deps

const notifyCooldowns = new Map(); // project → timestamp
const COOLDOWN_MS = 60_000; // 1 minute between notifications per project
const pendingRoutes = new Map(); // routeId → { text, expires }
let nextRouteId = 1;

/**
 * Safely load project config. Returns { projects: [] } on error.
 */
function loadConfigSafe() {
  try {
    const path = require('path');
    const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { projects: [] };
  }
}

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
        if (updates.length > 0) console.log(`[telegram] Received ${updates.length} update(s)`);

        for (const update of updates) {
          offset = update.update_id + 1;
          try {
            if (update.callback_query) {
              // Inline keyboard button press
              const cq = update.callback_query;
              const chatId = cq.message?.chat?.id;
              if (String(chatId) !== String(CHAT_ID)) continue;
              if (cq.id) await apiCall('answerCallbackQuery', { callback_query_id: cq.id });

              const cbData = cq.data || '';
              if (cbData.startsWith('route:')) {
                // Clarification routing: "route:projectName:routeId"
                const parts = cbData.split(':');
                const targetProject = parts[1];
                const routeId = parts[2];
                const pending = pendingRoutes.get(routeId);
                const origText = pending?.text;
                if (pending) pendingRoutes.delete(routeId);
                if (targetProject && origText) {
                  console.log(`[telegram] Clarification route "${origText.slice(0, 40)}" → ${targetProject}`);
                  injectTmux(targetProject, origText);
                }
              } else {
                // Normal notification button press
                const project = extractProject(cq.message?.text || '');
                if (project) {
                  console.log(`[telegram] Button "${cbData.slice(0, 40)}" → ${project}`);
                  injectTmux(project, cbData);
                }
              }
            } else if (update.message) {
              // Free-text reply
              const msg = update.message;
              if (String(msg.chat?.id) !== String(CHAT_ID)) continue;

              const replyText = msg.reply_to_message?.text || '';
              let project = extractProject(replyText);
              if (!project) project = extractProject(msg.text || '');
              if (project) {
                console.log(`[telegram] Routing "${(msg.text || '').slice(0, 40)}" → ${project}`);
                injectTmux(project, msg.text || '');
              } else {
                // Can't determine project — ask user to clarify with project buttons
                console.log(`[telegram] No project found for: "${(msg.text || '').slice(0, 40)}"`);
                const { projects } = loadConfigSafe();
                const active = projects.filter(p => p.tmux_session && isTmuxSessionActive(p.tmux_session));
                if (active.length > 0) {
                  const routeId = String(nextRouteId++);
                  pendingRoutes.set(routeId, { text: msg.text || '', expires: Date.now() + 300_000 });
                  // Clean up expired entries
                  for (const [k, v] of pendingRoutes) { if (v.expires < Date.now()) pendingRoutes.delete(k); }
                  const keyboard = active.map(p => [{ text: p.name, callback_data: `route:${p.name}:${routeId}` }]);
                  apiCall('sendMessage', {
                    chat_id: CHAT_ID,
                    text: `Which project should I send this to?\n\n"${(msg.text || '').slice(0, 100)}"`,
                    reply_markup: { inline_keyboard: keyboard },
                  }).catch(() => {});
                }
              }
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

/**
 * Clean raw terminal pane text for Telegram display.
 * Strips ANSI codes, box-drawing lines, spinner chars, collapses blank lines.
 * Returns last ~20 meaningful lines capped at 1500 chars.
 */
function formatForTelegram(paneText) {
  if (!paneText) return '';
  let text = paneText;
  // Strip ANSI escape codes
  text = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  text = text.replace(/\x1b\][^\x07]*\x07/g, ''); // OSC sequences
  text = text.replace(/\x1b[()][0-9A-B]/g, ''); // charset sequences
  // Split into lines and filter
  const BOX_CHARS = /^[\s─═│┌└┐┘├┤┬┴┼╔╗╚╝╠╣╦╩╬━┃┄┅┆┇┈┉┊┋╌╍╎╏]*$/;
  const SPINNER_CHARS = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷◐◓◑◒⠁⠂⠄⡀⢀⠠⠐⠈]/;
  let lines = text.split('\n')
    .map(l => l.trimEnd())
    .filter(l => !BOX_CHARS.test(l))        // remove box-drawing-only lines
    .filter(l => !SPINNER_CHARS.test(l))    // remove lines with spinner chars
    .filter(l => l.trim() !== '');           // remove blank lines
  // Collapse consecutive blank lines (after filtering, shouldn't be many)
  const collapsed = [];
  let lastBlank = false;
  for (const line of lines) {
    if (line.trim() === '') {
      if (!lastBlank) collapsed.push('');
      lastBlank = true;
    } else {
      collapsed.push(line);
      lastBlank = false;
    }
  }
  // Take last 20 meaningful lines, cap at 1500 chars
  const tail = collapsed.slice(-20);
  let result = tail.join('\n');
  if (result.length > 1500) result = '...' + result.slice(-1500);
  return result;
}

module.exports = { sendNotification, parseOptions, shouldNotify, startReplyPoller, stopReplyPoller, formatForTelegram, ENABLED };
