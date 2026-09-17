// Shared express-rate-limit instances (T-4.1). Extracted from server.js so
// routes/*.js can apply the exact same limiters the inline routes used,
// instead of each router growing its own copy with drifting numbers.
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

const RATE_LIMIT_MESSAGE = { error: 'Too many requests', code: 'RATE_LIMITED' };

// Everything under /api.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

// Login / register / OAuth start — brute-force protection, per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

// OpenAI-backed routes — per user when authenticated, per IP otherwise.
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
  keyGenerator: (req) => (req.user?.userId ? String(req.user.userId) : ipKeyGenerator(req.ip)),
});

module.exports = { RATE_LIMIT_MESSAGE, apiLimiter, authLimiter, aiLimiter };
