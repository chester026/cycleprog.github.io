const { pool } = require('../db');
const { verifySessionToken } = require('../lib/jwt');
const logger = require('../lib/logger');

// Moved verbatim from server.js (previously a local `function authMiddleware`
// defined inline). Response bodies on the pre-existing failure cases are
// unchanged (401 'No token' / 401 'Invalid token').
//
// T-4.5 (S-13 token revocation, S-27): this now also does one indexed
// `SELECT ... WHERE id = $1` per request to check the token's `tv` claim
// (lib/jwt.js's token_version, defaulting to 0 for tokens minted before this
// existed) against the row's current token_version — a mismatch, or the row
// being gone entirely (deleted account), 401s exactly like a bad signature
// does, so nothing here reveals which case it was. This is the one DB hit
// that makes password reset / logout-all / account or admin deletion able
// to invalidate every previously-issued token at once. The fetched row is
// stashed on `req.userRow` so requireAdmin (which must run immediately
// after this middleware) can reuse `is_admin` from it instead of paying for
// a second SELECT on the same row within the same request.
async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token', code: 'UNAUTHORIZED' });
  const token = auth.split(' ')[1];
  let payload;
  try {
    payload = verifySessionToken(token);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  }

  try {
    const result = await pool.query('SELECT token_version, is_admin FROM users WHERE id = $1', [payload.userId]);
    const row = result.rows[0];
    if (!row || (payload.tv ?? 0) !== (row.token_version ?? 0)) {
      return res.status(401).json({ error: 'Invalid token', code: 'UNAUTHORIZED' });
    }
    req.user = payload;
    req.userId = payload.userId;
    req.userRow = row;
    next();
  } catch (e) {
    // A genuine DB failure here is not the same as an invalid token —
    // surface it as a 500 rather than a misleading 401.
    logger.error({ err: e.message }, '[authMiddleware] token_version lookup failed:');
    res.status(500).json({ error: 'Failed to verify session', code: 'INTERNAL' });
  }
}

// Must run AFTER authMiddleware (needs req.user.userId already set). Reuses
// authMiddleware's req.userRow when present (the common case) instead of a
// second SELECT; falls back to its own query — unchanged from before T-4.5 —
// for any caller that invokes this without authMiddleware having run first
// (e.g. this file's own unit tests exercising requireAdmin in isolation).
async function requireAdmin(req, res, next) {
  try {
    const userId = req.user?.userId || req.userId;
    if (!userId) return res.status(401).json({ error: 'No token', code: 'UNAUTHORIZED' });
    if (req.userRow) {
      if (req.userRow.is_admin !== true) return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return next();
    }
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    if (!result.rows.length || result.rows[0].is_admin !== true) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    next();
  } catch (e) {
    logger.error({ err: e.message }, '[requireAdmin] error:');
    res.status(500).json({ error: 'Failed to verify admin status', code: 'INTERNAL' });
  }
}

module.exports = { authMiddleware, requireAdmin };
