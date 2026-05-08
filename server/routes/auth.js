'use strict';
const crypto = require('crypto');
const express = require('express');
const router = express.Router();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function hmac(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function generateToken(secret) {
  const expiry = (Date.now() + THIRTY_DAYS_MS).toString(16);
  const sig = hmac(expiry, secret);
  return `${expiry}.${sig}`;
}

function isValidToken(token) {
  const pass = process.env.DASHBOARD_PASS;
  if (!pass) return true; // no-auth mode
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expiry = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (Date.now() > parseInt(expiry, 16)) return false;
  const expected = hmac(expiry, pass);
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}

router.post('/login', (req, res) => {
  const pass = process.env.DASHBOARD_PASS;
  if (!pass) return res.json({ ok: true }); // no-auth mode

  const { password } = req.body || {};
  if (password !== pass) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = generateToken(pass);

  res.cookie('gsd_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: THIRTY_DAYS_MS,
    path: '/',
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('gsd_token', { path: '/' });
  res.json({ ok: true });
});

module.exports = { authRouter: router, isValidToken };
