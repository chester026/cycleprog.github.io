// Sign in with Apple, server side (docs/plans/auth-providers.md §3.2):
// verifying the identity token the client got from the OS, and the two
// calls that need the team's .p8 key — trading the authorization code for a
// refresh token, and revoking that token when the account is deleted (App
// Review requires the revoke for apps that offer Sign in with Apple).
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const logger = require('../../lib/logger');
const { externalHttp } = require('../../lib/http');
const { ApiError } = require('../../lib/apiError');
const { verifyIdToken } = require('./verify');

const ISSUER = 'https://appleid.apple.com';
const JWKS_URL = `${ISSUER}/auth/keys`;
// Apple accepts a client secret valid for up to six months; one is signed
// per call, so a few minutes is all it ever needs.
const CLIENT_SECRET_TTL_SEC = 300;

function audiences() {
  return [config.APPLE_BUNDLE_ID, config.APPLE_SERVICES_ID].filter(Boolean);
}

function isConfigured() {
  return audiences().length > 0;
}

let cachedPrivateKey;
function privateKey() {
  if (cachedPrivateKey !== undefined) return cachedPrivateKey;
  if (config.APPLE_PRIVATE_KEY) {
    // A PEM pasted into a one-line env var arrives with literal "\n".
    cachedPrivateKey = config.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  } else if (config.APPLE_PRIVATE_KEY_FILE) {
    cachedPrivateKey = fs.readFileSync(config.APPLE_PRIVATE_KEY_FILE, 'utf8');
  } else {
    cachedPrivateKey = null;
  }
  return cachedPrivateKey;
}

/** Whether the token/revoke endpoints can be called at all (the .p8 key is set up). */
function canManageTokens() {
  return Boolean(config.APPLE_TEAM_ID && config.APPLE_KEY_ID && privateKey());
}

function clientSecret(clientId) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: config.APPLE_TEAM_ID, iat: now, exp: now + CLIENT_SECRET_TTL_SEC, aud: ISSUER, sub: clientId },
    privateKey(),
    { algorithm: 'ES256', keyid: config.APPLE_KEY_ID }
  );
}

// Apple sends these two as the string "true" in some tokens and as a
// boolean in others.
function claimIsTrue(value) {
  return value === true || value === 'true';
}

/**
 * Verifies an Apple identity token and the nonce bound into it.
 * The native SDK hashes the nonce (SHA-256) before sending it to Apple, the
 * web SDK passes it through — either form of the caller's nonce matches.
 * @returns {Promise<{sub: string, email: string|null, emailVerified: boolean, clientId: string}>}
 */
async function verifyIdentityToken(identityToken, nonce) {
  if (!isConfigured()) throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Sign in with Apple is not configured');
  const claims = await verifyIdToken(identityToken, { jwksUrl: JWKS_URL, issuers: [ISSUER], audiences: audiences() });

  const hashed = crypto.createHash('sha256').update(String(nonce)).digest('hex');
  if (!claims.nonce || (claims.nonce !== nonce && claims.nonce !== hashed)) {
    throw new ApiError(401, 'INVALID_ID_TOKEN', 'Sign-in token rejected: nonce mismatch');
  }

  return {
    sub: String(claims.sub),
    email: claims.email || null,
    emailVerified: claimIsTrue(claims.email_verified),
    clientId: Array.isArray(claims.aud) ? claims.aud[0] : claims.aud,
  };
}

function tokenRequest(path, params) {
  return externalHttp.post(`${ISSUER}${path}`, new URLSearchParams(params).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

/**
 * Trades the one-time authorization code for a refresh token. Best-effort:
 * null when the key is not set up or Apple refuses — signing in must not
 * fail because the revoke-on-deletion bookkeeping could not be done.
 */
async function exchangeAuthorizationCode(authorizationCode, clientId) {
  if (!authorizationCode || !canManageTokens()) return null;
  try {
    const response = await tokenRequest('/auth/token', {
      client_id: clientId,
      client_secret: clientSecret(clientId),
      code: authorizationCode,
      grant_type: 'authorization_code',
    });
    return response.data?.refresh_token || null;
  } catch (err) {
    logger.warn({ err: err.response?.data || err.message }, '[apple] authorization code exchange failed');
    return null;
  }
}

/** Revokes the grant behind a refresh token. Best-effort; true when Apple accepted it. */
async function revokeRefreshToken(refreshToken, clientId) {
  if (!refreshToken || !canManageTokens()) return false;
  try {
    await tokenRequest('/auth/revoke', {
      client_id: clientId,
      client_secret: clientSecret(clientId),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    });
    return true;
  } catch (err) {
    logger.warn({ err: err.response?.data || err.message }, '[apple] token revoke failed');
    return false;
  }
}

module.exports = { isConfigured, canManageTokens, verifyIdentityToken, exchangeAuthorizationCode, revokeRefreshToken };
