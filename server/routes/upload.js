const express = require("express");
const router = express.Router();
const busboy = require("busboy");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// POST /api/upload — multipart file upload
router.post("/", (req, res) => {
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
    const { filename } = info;
    const ext = filename ? path.extname(filename) || ".bin" : ".bin";
    const slug = crypto.randomBytes(4).toString("hex");
    const destName = `${slug}${ext}`;
    const destPath = path.join(UPLOADS_DIR, destName);

    pendingWrite = true;
    const ws = fs.createWriteStream(destPath);
    let limitHit = false;

    fileStream.on("limit", () => {
      limitHit = true;
      fileStream.resume(); // drain
      ws.destroy();
      try { fs.unlinkSync(destPath); } catch {}
      pendingResult = { status: 413, error: "File too large (max 50MB)" };
    });

    fileStream.pipe(ws);

    ws.on("finish", () => {
      pendingWrite = false;
      if (!limitHit) {
        pendingResult = { url: `/uploads/${destName}` };
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
    bbFinished = true;
    sendResult();
  });

  req.pipe(bb);
});

module.exports = router;
