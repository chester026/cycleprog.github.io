// SQL for the Garmin Connect IQ bridge (docs/plans/garmin-connect-iq.md
// §2.1) — the `garmin_devices` table from migration 1758000000015. One row
// is both a pairing attempt (until consumed) and the paired-device record
// (after). See routes/garmin.js for HTTP, services/garmin.js for the flow.
const { pool } = require('../db');

async function createPairing({ deviceId, deviceName, code, pollKey, expiresAt }) {
  const result = await pool.query(
    `INSERT INTO garmin_devices (device_id, device_name, code, poll_key, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [deviceId, deviceName ?? null, code, pollKey, expiresAt]
  );
  return result.rows[0];
}

// Housekeeping run from pair/start: attempts nobody confirmed in time.
async function deleteExpiredUnconsumed() {
  await pool.query('DELETE FROM garmin_devices WHERE consumed_at IS NULL AND expires_at < NOW()');
}

async function findLiveByCode(code) {
  const result = await pool.query(
    `SELECT * FROM garmin_devices
      WHERE code = $1 AND consumed_at IS NULL AND user_id IS NULL AND expires_at > NOW()`,
    [code]
  );
  return result.rows[0] || null;
}

async function bindPairingToUser(id, userId) {
  const result = await pool.query(
    'UPDATE garmin_devices SET user_id = $2 WHERE id = $1 AND user_id IS NULL RETURNING *',
    [id, userId]
  );
  return result.rows[0] || null;
}

async function findByPollKey(pollKey) {
  const result = await pool.query('SELECT * FROM garmin_devices WHERE poll_key = $1', [pollKey]);
  return result.rows[0] || null;
}

// Marks the attempt consumed and records the token id in one statement, so
// two concurrent polls can't both mint a token: only the one that flips
// consumed_at from NULL gets a row back.
async function consumePairing(id, tokenId) {
  const result = await pool.query(
    `UPDATE garmin_devices SET consumed_at = NOW(), token_id = $2
      WHERE id = $1 AND consumed_at IS NULL AND user_id IS NOT NULL RETURNING *`,
    [id, tokenId]
  );
  return result.rows[0] || null;
}

// Per-request check for a device token (middleware/garmin.js). Also bumps
// last_seen_at — one UPDATE, no separate SELECT; a revoked or unknown token
// gets no row back.
async function touchDeviceByTokenId(tokenId) {
  const result = await pool.query(
    `UPDATE garmin_devices SET last_seen_at = NOW()
      WHERE token_id = $1 AND consumed_at IS NOT NULL AND revoked_at IS NULL
      RETURNING id, user_id, device_id, device_name`,
    [tokenId]
  );
  return result.rows[0] || null;
}

async function listDevices(userId) {
  const result = await pool.query(
    `SELECT id, device_id, device_name, consumed_at AS paired_at, last_seen_at
       FROM garmin_devices
      WHERE user_id = $1 AND consumed_at IS NOT NULL AND revoked_at IS NULL
      ORDER BY consumed_at DESC`,
    [userId]
  );
  return result.rows;
}

async function revokeDevice(id, userId) {
  const result = await pool.query(
    'UPDATE garmin_devices SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id',
    [id, userId]
  );
  return result.rowCount > 0;
}

async function revokeByTokenId(tokenId) {
  const result = await pool.query(
    'UPDATE garmin_devices SET revoked_at = NOW() WHERE token_id = $1 AND revoked_at IS NULL RETURNING id',
    [tokenId]
  );
  return result.rowCount > 0;
}

async function getUserForToken(userId) {
  const result = await pool.query('SELECT id, token_version FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

module.exports = {
  createPairing,
  deleteExpiredUnconsumed,
  findLiveByCode,
  bindPairingToUser,
  findByPollKey,
  consumePairing,
  touchDeviceByTokenId,
  listDevices,
  revokeDevice,
  revokeByTokenId,
  getUserForToken,
};
