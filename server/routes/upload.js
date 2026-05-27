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

  let finished = false;

  const bb = busboy({
    headers: req.headers,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  });

  let fileWritten = false;

  bb.on("file", (fieldname, fileStream, info) => {
    const { filename, mimeType } = info;
    const ext = filename ? path.extname(filename) || ".bin" : ".bin";
    const slug = crypto.randomBytes(4).toString("hex");
    const destName = `${slug}${ext}`;
    const destPath = path.join(UPLOADS_DIR, destName);

    const ws = fs.createWriteStream(destPath);
    let limitHit = false;

    fileStream.on("limit", () => {
      limitHit = true;
      fileStream.resume(); // drain
      ws.destroy();
      try { fs.unlinkSync(destPath); } catch {}
      if (!finished) {
        finished = true;
        res.status(413).json({ error: "File too large (max 50MB)" });
      }
    });

    fileStream.pipe(ws);

    ws.on("finish", () => {
      if (limitHit) return;
      fileWritten = true;
      const port = req.socket.localPort || 4820;
      const url = `http://localhost:${port}/uploads/${destName}`;
      if (!finished) {
        finished = true;
        res.json({ url });
      }
    });

    ws.on("error", (err) => {
      console.error("[upload] Write stream error:", err.message);
      if (!finished) {
        finished = true;
        res.status(500).json({ error: "Upload failed" });
      }
    });
  });

  bb.on("error", (err) => {
    console.error("[upload] Busboy error:", err.message);
    if (!finished) {
      finished = true;
      res.status(500).json({ error: "Upload failed" });
    }
  });

  bb.on("finish", () => {
    if (!fileWritten && !finished) {
      finished = true;
      res.status(400).json({ error: "No file provided" });
    }
  });

  req.pipe(bb);
});

module.exports = router;
