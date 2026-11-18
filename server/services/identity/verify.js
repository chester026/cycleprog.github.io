// Verifies an OpenID Connect ID token against its issuer's published keys:
// RS256 signature, issuer, audience, expiry. Shared by Apple and Google
// (./apple.js, ./google.js), which add their own claim handling on top.
const jwt = require('jsonwebtoken');
// Module object, not destructured, so tests can vi.spyOn(jwks,
// 'getSigningKey') and sign tokens with their own key.
const jwks = require('./jwks');
const { ApiError } = require('../../lib/apiError');

function invalidToken(reason) {
  return new ApiError(401, 'INVALID_ID_TOKEN', `Sign-in token rejected: ${reason}`);
}

/**
 * @param {string} token
 * @param {{jwksUrl: string, issuers: string[], audiences: string[]}} expected
 * @returns {Promise<object>} the token's claims
 */
async function verifyIdToken(token, { jwksUrl, issuers, audiences }) {
  const decoded = jwt.decode(token, { complete: true });
  // `alg` is pinned before any key is looked up: a token that names another
  // algorithm (none, HS256 keyed with the public key) never reaches verify.
  if (!decoded || typeof decoded.payload !== 'object' || decoded.header.alg !== 'RS256' || !decoded.header.kid) {
    throw invalidToken('malformed');
  }

  let key;
  try {
    key = await jwks.getSigningKey(jwksUrl, decoded.header.kid);
  } catch (err) {
    throw new ApiError(503, 'UPSTREAM_ERROR', `Could not reach the sign-in provider: ${err.message}`);
  }
  if (!key) throw invalidToken('unknown signing key');

  try {
    return jwt.verify(token, key, { algorithms: ['RS256'], issuer: issuers, audience: audiences });
  } catch (err) {
    throw invalidToken(err.message);
  }
}

module.exports = { verifyIdToken };
