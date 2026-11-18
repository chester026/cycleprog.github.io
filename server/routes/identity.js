// Sign in with Apple / Google and the account's sign-in methods
// (docs/plans/auth-providers.md §3.3). Mounted at /api. HTTP only: token
// verification in services/identity/{apple,google}.js, account resolution in
// services/identity/accounts.js.
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { ApiError } = require('../lib/apiError');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { issueSessionToken } = require('../lib/jwt');
const { createNonce, consumeNonce } = require('../lib/oauthState');
const { authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimits');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
const authService = require('../services/auth');
const apple = require('../services/identity/apple');
const google = require('../services/identity/google');
const accounts = require('../services/identity/accounts');

patchAsyncRoutes(router);

async function requireNonce(nonce) {
  if (!(await consumeNonce(pool, nonce))) {
    throw new ApiError(401, 'INVALID_NONCE', 'This sign-in attempt expired — please try again');
  }
}

// The nonce is single-use and spent before the token is looked at, so a
// captured (token, nonce) pair cannot be replayed.
async function verifyApple({ identityToken, nonce }) {
  await requireNonce(nonce);
  return apple.verifyIdentityToken(identityToken, nonce);
}

async function verifyGoogle({ idToken, nonce }) {
  if (nonce) await requireNonce(nonce);
  return google.verifyGoogleIdToken(idToken, nonce || null);
}

// Same envelope as POST /api/auth/exchange, plus isNewUser.
async function sessionEnvelope(req, { user, isNewUser }) {
  const token = issueSessionToken(user);
  const refreshToken = await authService.issueRefreshToken(user.id, { userAgent: req.headers['user-agent'] });
  return {
    token,
    refreshToken,
    isNewUser,
    user: { id: user.id, name: user.name, avatar: user.avatar, email: user.email },
  };
}

router.get('/auth/providers', contract(c.identity.providers), (req, res) => {
  res.json({ apple: apple.isConfigured(), google: google.isConfigured() });
});

router.get('/auth/nonce', contract(c.identity.nonce), async (req, res) => {
  res.json({ nonce: await createNonce(pool) });
});

// --- Sign in ----------------------------------------------------------------
router.post('/auth/apple', authLimiter, contract(c.identity.apple), async (req, res) => {
  const verified = await verifyApple(req.body);
  res.json(await sessionEnvelope(req, await accounts.signIn('apple', verified, req.body)));
});

router.post('/auth/google', authLimiter, contract(c.identity.google), async (req, res) => {
  const verified = await verifyGoogle(req.body);
  res.json(await sessionEnvelope(req, await accounts.signIn('google', verified)));
});

// --- Sign-in methods of the signed-in account -------------------------------
router.get('/auth/identities', authMiddleware, contract(c.identity.list), async (req, res) => {
  res.json(await accounts.listMethods(req.user.userId));
});

router.post('/auth/identities/apple', authMiddleware, contract(c.identity.linkApple), async (req, res) => {
  const verified = await verifyApple(req.body);
  res.json(await accounts.attach(req.user.userId, 'apple', verified, req.body));
});

router.post('/auth/identities/google', authMiddleware, contract(c.identity.linkGoogle), async (req, res) => {
  const verified = await verifyGoogle(req.body);
  res.json(await accounts.attach(req.user.userId, 'google', verified));
});

router.delete('/auth/identities/:provider', authMiddleware, contract(c.identity.unlink), async (req, res) => {
  res.json(await accounts.detach(req.user.userId, req.params.provider));
});

module.exports = router;
