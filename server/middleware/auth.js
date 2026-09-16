const { pool } = require('../db');
const { verifySessionToken } = require('../lib/jwt');
const logger = require('../lib/logger');

// Moved verbatim from server.js (previously a local `function authMiddleware`
// defined inline). Response bodies on failure are unchanged (401 'No token' /
// 401 'Invalid token'). Also sets req.userId (in addition to req.user) so
// routes/skillsHistory.js's `req.userId` usage keeps working when this
// middleware replaces that file's own duplicated copy.
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token', code: 'UNAUTHORIZED' });
  const token = auth.split(' ')[1];
  try {
    const payload = verifySessionToken(token);
    req.user = payload;
    req.userId = payload.userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  }
}

// Must run AFTER authMiddleware (needs req.user.userId already set).
async function requireAdmin(req, res, next) {
  try {
    const userId = req.user?.userId || req.userId;
    if (!userId) return res.status(401).json({ error: 'No token', code: 'UNAUTHORIZED' });
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
