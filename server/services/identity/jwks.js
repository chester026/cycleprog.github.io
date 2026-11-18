// Fetches and caches a provider's public signing keys (JWKS) — Apple and
// Google both rotate them, and both publish them under a `kid` the ID
// token's header names. A key set is reused for 6 hours; an unknown `kid`
// (rotation) triggers one refetch, at most once a minute, so a stream of
// forged tokens with random kids cannot turn into a stream of outbound
// requests.
const crypto = require('crypto');
const { externalHttp } = require('../../lib/http');

const KEYS_TTL_MS = 6 * 60 * 60 * 1000;
const REFETCH_MIN_INTERVAL_MS = 60 * 1000;

// url -> { fetchedAt, keys: Map<kid, KeyObject> }
const cache = new Map();

async function load(url) {
  const response = await externalHttp.get(url);
  const keys = new Map();
  for (const jwk of response.data?.keys || []) {
    if (jwk.kid && jwk.kty === 'RSA') keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
  }
  const entry = { fetchedAt: Date.now(), keys };
  cache.set(url, entry);
  return entry;
}

/** The public key for `kid`, or null when the provider does not publish it. */
async function getSigningKey(url, kid) {
  let entry = cache.get(url);
  const age = entry ? Date.now() - entry.fetchedAt : Infinity;
  if (age > KEYS_TTL_MS || (!entry.keys.has(kid) && age > REFETCH_MIN_INTERVAL_MS)) {
    entry = await load(url);
  }
  return entry.keys.get(kid) || null;
}

function _clearCacheForTests() {
  cache.clear();
}

module.exports = { getSigningKey, _clearCacheForTests };
