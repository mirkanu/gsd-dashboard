'use strict';

const { Router } = require('express');
const feedStore = require('../gsd/feedStore');

const router = Router();

// GET /api/feed — return in-memory landmark event feed (newest first)
// Query params: ?limit=N (default 200, max 200)
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 200);
  const events = feedStore.getEvents().slice(0, limit);
  res.json({ events });
});

module.exports = router;
