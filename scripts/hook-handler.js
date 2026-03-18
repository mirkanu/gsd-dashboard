#!/usr/bin/env node

/**
 * Claude Code hook handler.
 * Receives hook event JSON on stdin and forwards it to the Agent Dashboard API.
 * Designed to fail silently so it never blocks Claude Code.
 */

const http = require("http");
const https = require("https");

const hookType = process.argv[2] || "unknown";
const port = parseInt(process.env.CLAUDE_DASHBOARD_PORT || "4820", 10);
const remoteUrl = process.env.CLAUDE_DASHBOARD_URL || "";

let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let parsedData;
  try {
    parsedData = JSON.parse(input);
  } catch {
    parsedData = { raw: input };
  }

  const payload = JSON.stringify({
    hook_type: hookType,
    data: parsedData,
  });

  function postLocal() {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/hooks/event",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 3000,
      },
      (res) => { res.resume(); }
    );
    req.on("error", () => {});
    req.on("timeout", () => { req.destroy(); });
    req.write(payload);
    req.end();
  }

  function postRemote(url) {
    try {
      const parsed = new URL(url + "/api/hooks/event");
      const lib = parsed.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
          timeout: 5000,
        },
        (res) => { res.resume(); }
      );
      req.on("error", () => {});
      req.on("timeout", () => { req.destroy(); });
      req.write(payload);
      req.end();
    } catch {
      // Never block Claude
    }
  }

  postLocal();
  if (remoteUrl) postRemote(remoteUrl);
});

// Safety net timeout
setTimeout(() => process.exit(0), 5000);
