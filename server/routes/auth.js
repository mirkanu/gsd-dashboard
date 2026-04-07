'use strict';
const crypto = require('crypto');
const express = require('express');
const router = express.Router();

// In-memory token store: token -> expiry timestamp (ms)
// Simple and sufficient for a single-user local dashboard.
const tokens = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isValidToken(token) {
  if (!token) return false;
  const expiry = tokens.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) { tokens.delete(token); return false; }
  return true;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

router.post('/login', (req, res) => {
  const pass = process.env.DASHBOARD_PASS;
  if (!pass) return res.json({ ok: true }); // no-auth mode

  const { password } = req.body || {};
  if (password !== pass) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = generateToken();
  tokens.set(token, Date.now() + THIRTY_DAYS_MS);

  res.cookie('gsd_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: THIRTY_DAYS_MS,
    path: '/',
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  // Extract and revoke token
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith('gsd_token='));
  if (match) tokens.delete(match.slice('gsd_token='.length));
  res.clearCookie('gsd_token', { path: '/' });
  res.json({ ok: true });
});

module.exports = { authRouter: router, isValidToken };
