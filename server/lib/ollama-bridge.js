/**
 * ollama-bridge.js
 *
 * Translates Anthropic-format /v1/messages requests to Ollama's
 * OpenAI-compatible /v1/chat/completions endpoint so Claude Code can
 * run against a local Ollama server. The reverse (Ollama -> Anthropic)
 * is out of scope: only the outbound Anthropic request is translated
 * and the upstream response is passed through verbatim.
 *
 * Why a real bridge and not a no-op:
 *   `server/index.js` imports this module on startup. A missing file
 *   crashes boot with MODULE_NOT_FOUND. The original repo never
 *   committed it, so this commit adds the missing implementation.
 *
 * Usage:
 *   const { createBridgeHandler } = require("./lib/ollama-bridge");
 *   app.post("/ollama-bridge/v1/messages", createBridgeHandler(OLLAMA_HOST));
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Convert Anthropic /v1/messages body to OpenAI /v1/chat/completions body.
 * - Maps `system` string/array -> first system message.
 * - Maps `messages[*].content` (string or [{type:'text', text}, ...]) -> OpenAI content string.
 * - Drops tool_use/tool_result blocks (Ollama-side handling is not implemented here;
 *   a future commit can add a tool-call adapter if needed).
 * - Maps `model`, `max_tokens`, `temperature`, `stream` through.
 */
function anthropicToOpenAI(body) {
  const out = { messages: [], stream: !!body.stream };
  if (body.model) out.model = body.model;
  if (body.temperature != null) out.temperature = body.temperature;
  if (body.max_tokens != null) out.max_tokens = body.max_tokens;

  if (typeof body.system === 'string') {
    out.messages.push({ role: 'system', content: body.system });
  } else if (Array.isArray(body.system)) {
    const text = body.system
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
    if (text) out.messages.push({ role: 'system', content: text });
  }

  for (const m of body.messages || []) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    let content = '';
    if (typeof m.content === 'string') {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
    }
    if (content) out.messages.push({ role, content });
  }
  return out;
}

function createBridgeHandler(host) {
  const base = new URL(host.replace(/\/$/, '') + '/v1/chat/completions');
  const lib = base.protocol === 'https:' ? https : http;

  return function handleMessages(req, res) {
    let payload;
    try {
      const openaiBody = anthropicToOpenAI(req.body || {});
      payload = JSON.stringify(openaiBody);
    } catch (err) {
      return res.status(400).json({
        type: 'error',
        error: { type: 'invalid_request_error', message: `ollama-bridge: bad request — ${err.message}` },
      });
    }

    const proxyReq = lib.request(
      base,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 300000,
      },
      (proxyRes) => {
        res.status(proxyRes.statusCode || 502);
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (k.toLowerCase() !== 'content-length') res.setHeader(k, v);
        }
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      console.error(`[ollama-bridge] ERROR: ${err.message}`);
      if (!res.headersSent) {
        res.status(502).json({
          type: 'error',
          error: { type: 'api_error', message: `ollama-bridge: upstream error — ${err.message}` },
        });
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          type: 'error',
          error: { type: 'api_error', message: 'ollama-bridge: upstream timeout' },
        });
      }
    });

    proxyReq.write(payload);
    proxyReq.end();
  };
}

module.exports = { createBridgeHandler, anthropicToOpenAI };
