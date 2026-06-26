'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { sendFileDocument } = require('../gsd/telegram');

const router = express.Router();

/**
 * POST /api/telegram/send-file
 * Body: { filePath: string, caption?: string }
 * Sends a local file as a Telegram document.
 */
router.post('/send-file', async (req, res) => {
  const { filePath, caption } = req.body || {};

  // Validate filePath
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'filePath is required' });
  }

  // Resolve and prevent path traversal — allow files under /home/services/ and /data/home/
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith('/home/services/') && !resolved.startsWith('/data/home/')) {
    return res.status(403).json({ error: 'path traversal blocked' });
  }

  // Check file exists
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'file not found' });
  }

  try {
    await sendFileDocument(resolved, caption);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: 'telegram_failed' });
  }
});

module.exports = router;
