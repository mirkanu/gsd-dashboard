const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const MINIMAX_API_URL = "https://api.minimax.io/v1/chat/completions";
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

function getTargetModel() {
  try {
    const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf8");
    const settings = JSON.parse(raw);
    return settings._minimaxModel || "abab6.5s-chat";
  } catch {
    return "abab6.5s-chat";
  }
}

function createMiniMaxBridgeHandler() {
  return function handleMessages(req, res) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        type: "error",
        error: { type: "api_error", message: "MINIMAX_API_KEY not configured" },
      });
    }

    const targetModel = getTargetModel();

    // Transform Anthropic-format request to MiniMax format
    const minimaxRequest = {
      model: targetModel,
      messages: req.body.messages?.map(m => ({
        role: m.role === "assistant" ? "bot" : m.role,
        content: m.content,
      })) || [],
      stream: req.body.stream || false,
      temperature: req.body.temperature || 0.7,
      max_tokens: req.body.max_tokens || 1024,
    };

    const payload = JSON.stringify(minimaxRequest);

    console.log(`[minimax-bridge] model=${targetModel} stream=${minimaxRequest.stream} msgs=${minimaxRequest.messages.length}`);

    const url = new URL(MINIMAX_API_URL);
    const proxyReq = https.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${apiKey}`,
      },
      timeout: 300000,
    }, (proxyRes) => {
      res.status(proxyRes.statusCode);
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (k.toLowerCase() !== "content-length") res.setHeader(k, v);
      }
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error(`[minimax-bridge] ERROR: ${err.message}`);
      if (!res.headersSent) {
        res.status(502).json({
          type: "error",
          error: { type: "api_error", message: `MiniMax bridge error: ${err.message}` },
        });
      }
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          type: "error",
          error: { type: "api_error", message: "MiniMax request timed out" },
        });
      }
    });

    proxyReq.write(payload);
    proxyReq.end();
  };
}

module.exports = { createMiniMaxBridgeHandler };
