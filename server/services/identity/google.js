// Sign in with Google, server side (docs/plans/auth-providers.md §3.2):
// verifies the ID token the client got from Google's SDK. Nothing is stored
// on Google's side for us to revoke, so there is no token exchange here.
const config = require('../../config');
const { ApiError } = require('../../lib/apiError');
const { verifyIdToken } = require('./verify');

const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

function isConfigured() {
  return config.GOOGLE_CLIENT_IDS.length > 0;
}

/**
 * Verifies a Google ID token. The nonce is checked only when the client sent
 * one: the free @react-native-google-signin build cannot bind ours into the
 * token, and Google's iOS SDK puts a nonce of its own making into every
 * token — one this server never issued and cannot compare against anything.
 * Without a client nonce the token stands on signature, issuer, audience and
 * expiry.
 * @returns {Promise<{sub: string, email: string|null, emailVerified: boolean, name: string|null, picture: string|null, clientId: string}>}
 */
async function verifyGoogleIdToken(idToken, nonce) {
  if (!isConfigured()) throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Sign in with Google is not configured');
  const claims = await verifyIdToken(idToken, { jwksUrl: JWKS_URL, issuers: ISSUERS, audiences: config.GOOGLE_CLIENT_IDS });

  if (nonce && claims.nonce !== nonce) {
    throw new ApiError(401, 'INVALID_ID_TOKEN', 'Sign-in token rejected: nonce mismatch');
  }

  return {
    sub: String(claims.sub),
    email: claims.email || null,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: claims.name || null,
    picture: claims.picture || null,
    clientId: Array.isArray(claims.aud) ? claims.aud[0] : claims.aud,
  };
}

module.exports = { isConfigured, verifyGoogleIdToken };
