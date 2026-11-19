const crypto = require('crypto');

const MIN_SUBMIT_MS = 3000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip)).digest('hex');
}

function isHoneypotFilled(body) {
  return typeof body.website === 'string' && body.website.trim().length > 0;
}

function isTooFast(body) {
  const renderedAt = Number(body.formRenderedAt);
  if (!Number.isFinite(renderedAt)) return true; // missing/invalid timestamp: treat as spam
  return Date.now() - renderedAt < MIN_SUBMIT_MS;
}

module.exports = {
  MIN_SUBMIT_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  getClientIp,
  hashIp,
  isHoneypotFilled,
  isTooFast,
};
