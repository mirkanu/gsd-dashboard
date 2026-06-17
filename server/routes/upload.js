const express = require("express");
const router = express.Router();
const busboy = require("busboy");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// POST /api/upload — multipart file upload
router.post("/", (req, res) => {
  console.log("[upload] Upload request received");

  // Ensure uploads directory exists
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (e) {
    console.error("[upload] Failed to create uploads dir:", e.message);
    return res.status(500).json({ error: "Upload failed" });
  }

  let responded = false;
  let bbFinished = false;
  let pendingWrite = false; // true while a file write is in progress
  let pendingResult = null; // { url } or { error } to send after write completes

  function sendResult() {
    // Only send when both busboy is done AND the write stream has closed
    if (!bbFinished || pendingWrite) return;
    if (responded) return;
    responded = true;
    if (pendingResult && pendingResult.url) {
      res.json({ url: pendingResult.url });
    } else if (pendingResult && pendingResult.status) {
      res.status(pendingResult.status).json({ error: pendingResult.error });
    } else {
      res.status(400).json({ error: "No file provided" });
    }
  }

  const bb = busboy({
    headers: req.headers,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  });

  bb.on("file", (fieldname, fileStream, info) => {
    const { filename, mimeType } = info;
    console.log("[upload] File event received:", filename, mimeType);
    const ext = filename ? path.extname(filename) || ".bin" : ".bin";
    const slug = crypto.randomBytes(4).toString("hex");
    const destName = `${slug}${ext}`;
    const destPath = path.join(UPLOADS_DIR, destName);

    pendingWrite = true;
    const ws = fs.createWriteStream(destPath);
    let bytesReceived = 0;
    let limitHit = false;

    fileStream.on("data", (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived % (10 * 1024 * 1024) < chunk.length) { // Log every 10MB
        console.log(`[upload] Progress: ${(bytesReceived / 1024 / 1024).toFixed(1)}MB received`);
      }
    });

    fileStream.on("limit", () => {
      limitHit = true;
      fileStream.resume(); // drain
      ws.destroy();
      try { fs.unlinkSync(destPath); } catch {}
      pendingResult = { status: 413, error: "File too large (max 100MB)" };
    });

    fileStream.pipe(ws);

    ws.on("finish", () => {
      console.log("[upload] File write complete:", destName, `Total: ${(bytesReceived / 1024 / 1024).toFixed(1)}MB`);
      pendingWrite = false;
      if (!limitHit) {
        const port = req.socket.localPort || 4820;
        pendingResult = { url: `http://localhost:${port}/uploads/${destName}` };
      }
      sendResult();
    });

    ws.on("error", (err) => {
      console.error("[upload] Write stream error:", err.message);
      pendingWrite = false;
      pendingResult = { status: 500, error: "Upload failed" };
      sendResult();
    });
  });

  bb.on("error", (err) => {
    console.error("[upload] Busboy error:", err.message);
    bbFinished = true;
    pendingResult = { status: 500, error: "Upload failed" };
    sendResult();
  });

  bb.on("finish", () => {
    console.log("[upload] Busboy finished parsing");
    bbFinished = true;
    sendResult();
  });

  req.pipe(bb);
});

module.exports = router;
