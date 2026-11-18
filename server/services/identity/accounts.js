// Which BikeLab account an Apple/Google identity belongs to, and the
// "sign-in methods" of an account (docs/plans/auth-providers.md §3.3–3.4).
// The token has already been verified by ./apple.js or ./google.js; this
// module only ever sees the claims.
const { withTransaction } = require('../../db');
const logger = require('../../lib/logger');
const secretBox = require('../../lib/secretBox');
const { ApiError } = require('../../lib/apiError');
const identitiesRepo = require('../../repositories/identities');
const usersRepo = require('../../repositories/users');
// Module object so tests can stub the two network calls.
const apple = require('./apple');

const UNIQUE_VIOLATION = '23505';
const PROVIDER_LABELS = { apple: 'Apple', google: 'Google' };

function normaliseEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value.includes('@') ? value : null;
}

// Google puts the name in the token; Apple hands it to the client once, on
// the first authorization, and the client forwards it as `fullName`.
function displayName(verified, fullName) {
  if (verified.name) return verified.name;
  const parts = [fullName?.givenName, fullName?.familyName].map((part) => String(part || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function identityFields(userId, provider, verified, email) {
  return {
    userId,
    provider,
    providerUserId: verified.sub,
    email,
    emailVerified: verified.emailVerified,
    clientId: verified.clientId,
  };
}

// In order, first match wins:
//   1. the identity is already attached to an account;
//   2. the provider vouches for an address that an account has itself
//      verified — both sides proven, so it is the same person;
//   3. a new account.
// An address someone merely typed into a profile proves nothing, so an
// unverified match is never followed, and no existing row is touched: when
// the address is already held by another account the new one starts without
// it (the identity row still records it).
async function resolveAccount(provider, verified, fullName) {
  const email = normaliseEmail(verified.email);
  const name = displayName(verified, fullName);

  return withTransaction(async (db) => {
    const identity = await identitiesRepo.findByProviderSub(provider, verified.sub, db);
    if (identity) {
      await identitiesRepo.recordLogin(identity.id, { email, emailVerified: verified.emailVerified }, db);
      return { userId: identity.user_id, identityId: identity.id, isNewUser: false };
    }

    if (email && verified.emailVerified) {
      const owner = await identitiesRepo.findVerifiedUserByEmail(email, db);
      // An owner who already signs in with a different account of the same
      // provider keeps that one; this identity gets its own account.
      if (owner && !(await identitiesRepo.findForUser(owner.id, provider, db))) {
        const attached = await identitiesRepo.insertIdentity(identityFields(owner.id, provider, verified, email), db);
        await identitiesRepo.fillMissingName(owner.id, name, db);
        return { userId: owner.id, identityId: attached.id, isNewUser: false };
      }
    }

    const emailIsFree = Boolean(email) && !(await identitiesRepo.isEmailTaken(email, db));
    const user = await identitiesRepo.insertIdentityUser(
      {
        email: emailIsFree ? email : null,
        emailVerified: emailIsFree && verified.emailVerified,
        name,
        avatar: verified.picture || null,
        avatarSource: verified.picture ? provider : null,
      },
      db
    );
    const created = await identitiesRepo.insertIdentity(identityFields(user.id, provider, verified, email), db);
    return { userId: user.id, identityId: created.id, isNewUser: true };
  });
}

// Keeps the latest Apple refresh token (sealed) so the grant can be revoked
// when the account is deleted. Skipped without an encryption key: a token
// that cannot be stored safely is not fetched.
async function rememberAppleGrant(identityId, verified, authorizationCode) {
  if (!authorizationCode || !secretBox.isConfigured()) return;
  const refreshToken = await apple.exchangeAuthorizationCode(authorizationCode, verified.clientId);
  if (!refreshToken) return;
  await identitiesRepo.storeRefreshToken(identityId, {
    sealedRefreshToken: secretBox.seal(refreshToken),
    clientId: verified.clientId,
  });
}

/**
 * Signs a rider in with a verified provider identity, creating the account
 * on first sight.
 * @returns {Promise<{user: object, isNewUser: boolean}>}
 */
async function signIn(provider, verified, { fullName, authorizationCode } = {}) {
  let resolved;
  try {
    resolved = await resolveAccount(provider, verified, fullName);
  } catch (err) {
    // Two first sign-ins of the same identity racing each other: the loser
    // hits a UNIQUE constraint; by now the winner's rows are committed.
    if (err.code !== UNIQUE_VIOLATION) throw err;
    resolved = await resolveAccount(provider, verified, fullName);
  }

  if (provider === 'apple') await rememberAppleGrant(resolved.identityId, verified, authorizationCode);

  const user = await usersRepo.findById(resolved.userId);
  return { user, isNewUser: resolved.isNewUser };
}

/** The account's sign-in methods, as GET /api/auth/identities returns them. */
async function listMethods(userId) {
  const [methods, hasPassword] = await Promise.all([
    identitiesRepo.listForUser(userId),
    identitiesRepo.hasPassword(userId),
  ]);
  return {
    methods,
    has_password: hasPassword,
    needs_sign_in_method: methods.length === 0 && !hasPassword,
  };
}

// A Strava-only account usually has no address at all; the one the provider
// vouches for becomes its contact address, unless someone else holds it.
async function adoptVerifiedEmail(userId, email, verified) {
  if (!email || !verified.emailVerified || (await identitiesRepo.isEmailTaken(email))) return;
  try {
    await identitiesRepo.fillMissingEmail(userId, email);
  } catch (err) {
    // Taken between the check and the write — the account simply stays without one.
    if (err.code !== UNIQUE_VIOLATION) throw err;
  }
}

/** Attaches a verified identity to the signed-in account. Idempotent for the same identity. */
async function attach(userId, provider, verified, { fullName, authorizationCode } = {}) {
  const label = PROVIDER_LABELS[provider];
  const email = normaliseEmail(verified.email);

  let identity = await identitiesRepo.findByProviderSub(provider, verified.sub);
  if (identity && identity.user_id !== userId) {
    throw new ApiError(409, 'IDENTITY_TAKEN', `This ${label} account is already used by another BikeLab account`);
  }

  if (!identity) {
    if (await identitiesRepo.findForUser(userId, provider)) {
      throw new ApiError(409, 'PROVIDER_ALREADY_LINKED', `Another ${label} account is already attached — remove it first`);
    }
    try {
      identity = await identitiesRepo.insertIdentity(identityFields(userId, provider, verified, email));
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) throw err;
      throw new ApiError(409, 'IDENTITY_TAKEN', `This ${label} account is already used by another BikeLab account`);
    }
    await identitiesRepo.fillMissingName(userId, displayName(verified, fullName));
    await adoptVerifiedEmail(userId, email, verified);
  }

  if (provider === 'apple') await rememberAppleGrant(identity.id, verified, authorizationCode);
  return listMethods(userId);
}

/** Detaches a sign-in method — never the last one, or the rider could not get back in. */
async function detach(userId, provider) {
  const current = await listMethods(userId);
  if (!current.methods.some((method) => method.provider === provider)) {
    throw new ApiError(404, 'IDENTITY_NOT_FOUND', 'This sign-in method is not attached');
  }
  const othersLeft = current.methods.length - 1 + (current.has_password ? 1 : 0);
  if (othersLeft < 1) {
    throw new ApiError(409, 'LAST_SIGN_IN_METHOD', 'Add another sign-in method before removing this one');
  }

  const removed = await identitiesRepo.deleteForUser(userId, provider);
  await revokeGrant(removed);
  return listMethods(userId);
}

async function revokeGrant(identity) {
  if (!identity || identity.provider !== 'apple' || !identity.refresh_token) return;
  const refreshToken = secretBox.open(identity.refresh_token);
  const revoked = await apple.revokeRefreshToken(refreshToken, identity.client_id);
  if (!revoked) logger.warn({ provider: identity.provider }, '[identity] provider grant could not be revoked');
}

/**
 * Revokes whatever the account holds on a provider's side. Called before an
 * account is deleted; never throws — the deletion must go through either way.
 */
async function revokeGrantsForUser(userId) {
  try {
    const identities = await identitiesRepo.listRevocable(userId);
    for (const identity of identities) await revokeGrant(identity);
  } catch (err) {
    logger.error({ err: err.message, userId }, '[identity] revoking provider grants failed');
  }
}

module.exports = { signIn, listMethods, attach, detach, revokeGrantsForUser };
