// Shared helpers for integration tests (T-1.7).
const bcrypt = require('bcrypt');

// Inserts a user directly (bypassing /api/register + email verification —
// this suite already covers that flow separately in auth.test.js) and
// returns {id, email, token} via a real /api/login call, so every test gets
// a session JWT produced by the exact same code path a real client would
// use.
async function createUser(pool, app, request, { email, password = 'Sup3rSecret!', isAdmin = false, emailVerified = true } = {}) {
  const finalEmail = email || `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified, is_admin, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, email`,
    [finalEmail, passwordHash, 'Test User', emailVerified, isAdmin]
  );
  const user = result.rows[0];

  if (!emailVerified) {
    // Caller wants an unverified user for a specific test (e.g. login
    // rejection) — no token to mint, since /api/login would 403.
    return { id: user.id, email: user.email, password, token: null };
  }

  const loginRes = await request(app).post('/api/login').send({ email: finalEmail, password });
  if (loginRes.status !== 200) {
    throw new Error(`createUser: login failed unexpectedly: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }
  return { id: user.id, email: user.email, password, token: loginRes.body.token };
}

module.exports = { createUser };
