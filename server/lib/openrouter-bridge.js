const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/messages";
const DEFAULT_MODEL = "openrouter/owl-alpha";
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

function getTargetModel() {
  try {
    const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf8");
    const settings = JSON.parse(raw);
    return settings._openrouterModel || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

function createOpenRouterBridgeHandler() {
  return function handleMessages(req, res) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        type: "error",
        error: { type: "api_error", message: "OPENROUTER_API_KEY not configured" },
      });
    }

    const targetModel = getTargetModel();
    // Deep clone and force ALL model references to targetModel
    const body = JSON.parse(JSON.stringify(req.body));
    body.model = targetModel;

    // Recursively overwrite any nested model fields (e.g., in tools, thinking, etc.)
    function overwriteModels(obj) {
      if (typeof obj !== 'object' || obj === null) return;
      if (Array.isArray(obj)) {
        obj.forEach(overwriteModels);
        return;
      }
      for (const key in obj) {
        if (key === 'model' && typeof obj[key] === 'string') {
          obj[key] = targetModel;
        } else if (typeof obj[key] === 'object') {
          overwriteModels(obj[key]);
        }
      }
    }
    overwriteModels(body);

    const payload = JSON.stringify(body);

    console.log(`[openrouter-bridge] model=${targetModel} stream=${!!body.stream} msgs=${body.messages?.length}`);

    const url = new URL(OPENROUTER_API_URL);
    const proxyReq = https.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      timeout: 300000,
    }, (proxyRes) => {
      res.status(proxyRes.statusCode);
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        // Skip content-length — piping may alter chunking
        if (k.toLowerCase() !== "content-length") res.setHeader(k, v);
      }
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error(`[openrouter-bridge] ERROR: ${err.message}`);
      if (!res.headersSent) {
        res.status(502).json({
          type: "error",
          error: { type: "api_error", message: `OpenRouter bridge error: ${err.message}` },
        });
      }
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          type: "error",
          error: { type: "api_error", message: "OpenRouter request timed out" },
        });
      }
    });

    proxyReq.write(payload);
    proxyReq.end();
  };
}

module.exports = { createOpenRouterBridgeHandler };
