// Register/login/verify-email/resend-verification + the Strava/Oura account
// linking logic that used to live inline in server.js's `/api/register`,
// `/api/verify-email`, `/api/resend-verification`, `/api/login`,
// `/exchange_token`, `/oura/exchange_token`, `/link_strava` and
// `/api/unlink_strava` handlers (T-4.1 domain extraction). Moved verbatim —
// same bcrypt cost factor, same token lifetimes/claims (via lib/jwt), same
// one-time auth-code semantics (via lib/oauthState), same SQL (via
// repositories/users.js). Routes (routes/auth.js, routes/oauthCallbacks.js)
// still own translating a thrown error into the exact original HTTP
// status/body — this module only throws typed errors, it never sets a
// status code itself.
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const logger = require('../lib/logger');
const config = require('../config');
// Required as the module object (not destructured) so tests can
// `vi.spyOn(brevoConfig, 'sendVerificationEmail')` etc. and have it take
// effect here — a destructured local binding would freeze the reference at
// require time, before any test gets a chance to replace it.
const brevoConfig = require('../brevo-config');
const { issueSessionToken } = require('../lib/jwt');
const { consumeAuthCode } = require('../lib/oauthState');
const stravaOAuth = require('./strava/oauth');
const ouraService = require('../ouraService');
const usersRepo = require('../repositories/users');

class EmailAlreadyExistsError extends Error {}
class InvalidVerificationTokenError extends Error {}
class VerificationTokenExpiredError extends Error {}
class UserNotFoundError extends Error {}
class AlreadyVerifiedError extends Error {}
class VerificationEmailFailedError extends Error {}
class InvalidCredentialsError extends Error {}
class EmailNotVerifiedError extends Error {}
class InvalidOrExpiredCodeError extends Error {}
class StravaAlreadyLinkedError extends Error {}
// T-4.5 auth hardening (S-13, S-14, S-27, A-05) — see each function below.
class InvalidOrExpiredResetTokenError extends Error {}
class WeakPasswordError extends Error {}
class InvalidRefreshTokenError extends Error {}
class RefreshTokenReusedError extends Error {}
class InvalidEmailError extends Error {}
class EmailTakenError extends Error {}

// Reset/refresh tokens are opaque `crypto.randomBytes(32)` values handed to
// the client exactly once; only this SHA-256 hash is ever persisted (both
// users.password_reset_token_hash and refresh_tokens.token_hash), so a
// stolen DB dump can't be replayed as a live token.
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// POST /api/register
async function register({ email, password, name }) {
  const existingUser = await usersRepo.findIdByEmail(email);
  if (existingUser) throw new EmailAlreadyExistsError('User with this email already exists');

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await usersRepo.insertUser({ email, passwordHash: hashedPassword, name });

  const verificationToken = brevoConfig.generateVerificationToken();
  await usersRepo.setVerificationToken(user.id, verificationToken);

  await brevoConfig.sendVerificationEmail(email, verificationToken, name);

  return user;
}

// GET /api/verify-email
async function verifyEmail(token) {
  const user = await usersRepo.findByVerificationToken(token);
  if (!user) throw new InvalidVerificationTokenError('Invalid verification token');

  if (new Date() > new Date(user.verification_token_expires)) {
    throw new VerificationTokenExpiredError('Verification token has expired');
  }

  await usersRepo.markEmailVerified(user.id);
}

// POST /api/resend-verification
async function resendVerification(email) {
  const user = await usersRepo.findVerificationStatusByEmail(email);
  if (!user) throw new UserNotFoundError('User not found');
  if (user.email_verified) throw new AlreadyVerifiedError('Email is already verified');

  const verificationToken = brevoConfig.generateVerificationToken();
  const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа
  await usersRepo.setVerificationTokenWithExpiry(user.id, verificationToken, tokenExpires);

  const emailSent = await brevoConfig.sendVerificationEmail(email, verificationToken);
  if (!emailSent) throw new VerificationEmailFailedError('Failed to send verification email');
}

// POST /api/login
async function login({ email, password }) {
  const user = await usersRepo.findByEmailFull(email);
  if (!user) throw new InvalidCredentialsError('Invalid credentials');

  // Strava-only accounts have no password_hash — bcrypt.compare(x, null) throws (500).
  // Same 401 as a wrong password so the response doesn't reveal account type.
  const match = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
  if (!match) throw new InvalidCredentialsError('Invalid credentials');

  if (!user.email_verified) throw new EmailNotVerifiedError('Email not verified. Please check your email and click the verification link.');

  const token = issueSessionToken(user);
  return { token, user };
}

// POST /api/auth/exchange
async function exchangeAuthCode(pool, code) {
  const userId = await consumeAuthCode(pool, code);
  if (!userId) throw new InvalidOrExpiredCodeError('Invalid or expired code');
  const user = await usersRepo.findById(userId);
  if (!user) throw new UserNotFoundError('User not found');
  const jwtToken = issueSessionToken(user);
  return { token: jwtToken, user };
}

// GET /exchange_token (Strava login callback) — finds-or-creates-or-reunites
// the user for this Strava athlete. See server.js's original comment (kept
// here) for why lookup falls back to strava_athlete_id: a user who
// previously unlinked Strava (POST /api/unlink_strava nulls strava_id, but
// never strava_athlete_id) must be reunited with their existing account
// rather than getting a brand new one — email/name are not reliable keys
// (Strava often omits email, and names collide).
async function findOrCreateStravaUser(athlete, tokenData) {
  const strava_id = athlete.id;
  const email = athlete.email || null;
  const name = athlete.firstname + (athlete.lastname ? ' ' + athlete.lastname : '');
  const avatar = athlete.profile || null;
  const { access_token, refresh_token, expires_at } = tokenData;

  let user = await usersRepo.findByStravaId(strava_id);
  if (user) {
    await usersRepo.updateStravaLoginFields(user.id, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_at,
      name,
      email,
      avatar,
    });
    return user;
  }

  const byAthleteId = await usersRepo.findByStravaAthleteId(strava_id);
  if (byAthleteId) {
    await usersRepo.reuniteStravaAccount(byAthleteId.id, {
      stravaId: strava_id,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_at,
      name,
      avatar,
    });
    return usersRepo.findById(byAthleteId.id);
  }

  return usersRepo.insertStravaUser({
    stravaId: strava_id,
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: expires_at,
    name,
    email,
    avatar,
  });
}

// GET /oura/exchange_token
async function connectOura(pool, userId, code, redirectUri) {
  const tokens = await ouraService.exchangeCodeForToken(code, redirectUri);
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = nowSec + (Number(tokens.expires_in) || 0);
  const personalInfo = await ouraService.fetchPersonalInfo(tokens.access_token);

  await usersRepo.updateOuraTokens(userId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    ouraUserId: String(personalInfo.id || ''),
  });

  // Warm the cache with the last two weeks right away so the coach and
  // OuraIntegrationScreen have data immediately, same idea as Strava's
  // first sync. Best-effort — a failure here shouldn't block the
  // "you're connected" page; /api/oura/sync covers manual retry.
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    await ouraService.fetchAndCacheOuraData(pool, userId, { startDate: fmt(start), endDate: fmt(end) });
  } catch (e) {
    logger.error({ err: e.response?.data || e.message }, '[oura] initial sync after connect failed (non-fatal):');
  }
}

// GET /link_strava
async function linkStravaAccount(userId, athlete, tokenData) {
  const strava_id = athlete.id;
  const email = athlete.email || null;
  const name = athlete.firstname + (athlete.lastname ? ' ' + athlete.lastname : '');
  const avatar = athlete.profile || null;
  const { access_token, refresh_token, expires_at } = tokenData;

  // Проверяем, не занят ли этот strava_id (активная связь) или
  // strava_athlete_id (постоянный якорь, переживающий unlink) другим
  // пользователем.
  const conflicting = await usersRepo.findConflictingStravaUser(strava_id, userId);
  if (conflicting) throw new StravaAlreadyLinkedError('This Strava account is already linked to another user.');

  await usersRepo.linkStravaToUser(userId, {
    stravaId: strava_id,
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: expires_at,
    name,
    email,
    avatar,
  });
}

// POST /api/unlink_strava
async function unlinkStrava(userId, { activitiesCache, bikesCache, stravaActivities }) {
  // Получаем текущий access_token для деавторизации в Strava
  const currentAccessToken = await usersRepo.getStravaAccessToken(userId);
  if (currentAccessToken) {
    await stravaOAuth.deauthorize(currentAccessToken);
  }

  // Обнуляем strava_id и все связанные поля
  await usersRepo.clearStravaLink(userId);
  // Strava API agreement: data obtained from Strava must be deleted when the
  // athlete deauthorizes. Mirrored activities/bikes go too, plus our caches.
  await usersRepo.deleteSyncedActivities(userId);
  await usersRepo.deleteSyncedBikes(userId);
  await stravaActivities.invalidate(userId);
  await stravaActivities.invalidateBikes(userId);
  // Очищаем серверный кэш Strava activities и велосипедов для этого пользователя
  await activitiesCache.delete(userId);
  await bikesCache.delete(userId);
  // Получаем обновлённого пользователя
  const user = await usersRepo.findById(userId);
  // Генерируем новый JWT без strava_id
  return issueSessionToken(user);
}

// --- refresh tokens (opt-in, additive — S-14) ------------------------------

// Called alongside issueSessionToken by every route that currently mints a
// login-time JWT (POST /api/login, POST /api/auth/exchange) — additive: it
// never replaces the access token, and a client that never sends
// `refreshToken` back keeps behaving exactly like before this existed.
async function issueRefreshToken(userId, { userAgent, familyId } = {}) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await usersRepo.createRefreshToken({
    userId,
    tokenHash,
    familyId: familyId || crypto.randomUUID(),
    expiresAt,
    userAgent,
  });
  return rawToken;
}

// POST /api/auth/refresh. Rotates: the presented token is revoked and a new
// (token, refreshToken) pair is issued in its place, keeping the same
// family_id. Presenting a token that's already revoked — i.e. one that was
// already rotated away, or whose family was already torn down — means the
// same refresh token was used twice, which only happens if it leaked
// (client bug re-sending an old value, or genuine theft); either way the
// entire family is revoked so the leaked chain can't be used again, and the
// caller must log in again.
async function rotateRefreshToken(rawToken, { userAgent } = {}) {
  const tokenHash = hashToken(rawToken);
  const row = await usersRepo.findRefreshTokenByHash(tokenHash);
  if (!row) throw new InvalidRefreshTokenError('Invalid refresh token');

  if (row.revoked_at) {
    await usersRepo.revokeRefreshTokenFamily(row.family_id);
    throw new RefreshTokenReusedError('Refresh token reuse detected');
  }
  if (new Date(row.expires_at) < new Date()) {
    throw new InvalidRefreshTokenError('Refresh token expired');
  }

  const user = await usersRepo.findById(row.user_id);
  if (!user) throw new UserNotFoundError('User not found');

  await usersRepo.revokeRefreshToken(row.id);
  const newRawToken = await issueRefreshToken(user.id, { userAgent, familyId: row.family_id });
  const token = issueSessionToken(user);
  return { token, refreshToken: newRawToken, user };
}

// POST /api/auth/logout {refreshToken}. Idempotent and silent about whether
// the token existed/was already revoked — logging out is not a place to
// leak that information, and a client retrying a logout call shouldn't see
// an error.
async function logout(rawToken) {
  if (!rawToken) return;
  const row = await usersRepo.findRefreshTokenByHash(hashToken(rawToken));
  if (row && !row.revoked_at) await usersRepo.revokeRefreshToken(row.id);
}

// POST /api/auth/logout-all. Bumps token_version (invalidating every
// session JWT already issued — S-13) and revokes every refresh token for
// this user, so nothing can silently mint a fresh session JWT afterwards
// via POST /api/auth/refresh either.
async function logoutAll(userId) {
  await usersRepo.bumpTokenVersion(userId);
  await usersRepo.revokeAllRefreshTokensForUser(userId);
}

// --- password reset (POST /api/forgot-password, /api/reset-password, A-05) -

// Always resolves — never throws for "no such user" — so routes/auth.js's
// handler can return an identical 200 whether or not the email exists (no
// user enumeration, A-05). A genuine send failure (Brevo down) is logged by
// the caller but likewise must not change the response.
async function forgotPassword(email) {
  const existing = await usersRepo.findIdByEmail(email);
  if (!existing) return;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  // 1 hour — matches the copy in brevo-config.js's sendPasswordResetEmail
  // template ("This link will expire in 1 hour").
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await usersRepo.setPasswordResetToken(existing.id, tokenHash, expiresAt);
  await brevoConfig.sendPasswordResetEmail(email, rawToken);
}

// POST /api/reset-password {token, password}. `password` gets its own
// minimum here (8 chars) rather than reusing RegisterBodySchema's
// `z.string().min(1)` — register's near-absent length check is a pre-
// existing gap this task doesn't touch, but a password RESET is exactly the
// kind of security-sensitive path this task exists to harden, so it isn't
// mirrored here.
async function resetPassword(token, password) {
  if (!password || password.length < 8) {
    throw new WeakPasswordError('Password must be at least 8 characters');
  }

  const user = await usersRepo.findByPasswordResetTokenHash(hashToken(token));
  if (!user || !user.password_reset_expires || new Date() > new Date(user.password_reset_expires)) {
    throw new InvalidOrExpiredResetTokenError('Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await usersRepo.updatePasswordHash(user.id, passwordHash);
  await usersRepo.clearPasswordReset(user.id);
  // Whoever reset the password can log back in fresh — invalidate every
  // session JWT and refresh token issued before now (S-13): if the reset
  // was needed because credentials leaked, an attacker's still-live session
  // must not survive it.
  await usersRepo.bumpTokenVersion(user.id);
  await usersRepo.revokeAllRefreshTokensForUser(user.id);
}

// --- email change (POST /api/user-profile/email, S-27) --------------------

// Replaces routes/userProfile.js's previous inline POST /email handler,
// which: (1) accepted any string containing "@" with no trimming/case
// normalisation, (2) checked for a conflicting owner via a second query
// keyed on the raw, non-normalised value, (3) on success left
// `email_verified` at whatever it already was — so an account that was
// verified before the change stayed "verified" for a brand new address
// nobody had proven they controlled (S-27) — and (4) never sent any
// verification email for the new address at all.
//
// This version: trims/lowercases before comparing or storing, 409s
// EMAIL_TAKEN (was 400 EMAIL_ALREADY_EXISTS) on conflict, always sets
// `email_verified = false` on the new address, and sends the same
// verification email register() sends for a brand new account. The response
// shape callers see (`{success, message, token}`) is unchanged; only the
// message content and the conflict status/code differ, per this task.
async function changeEmail(userId, newEmail) {
  const normalized = String(newEmail || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new InvalidEmailError('Valid email address is required');
  }

  const existing = await usersRepo.findIdByEmail(normalized);
  if (existing && existing.id !== userId) {
    throw new EmailTakenError('This email is already used by another account');
  }

  await usersRepo.setEmailUnverified(userId, normalized);

  const verificationToken = brevoConfig.generateVerificationToken();
  const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await usersRepo.setVerificationTokenWithExpiry(userId, verificationToken, tokenExpires);
  await brevoConfig.sendVerificationEmail(normalized, verificationToken);

  return usersRepo.findById(userId);
}

module.exports = {
  EmailAlreadyExistsError,
  InvalidVerificationTokenError,
  VerificationTokenExpiredError,
  UserNotFoundError,
  AlreadyVerifiedError,
  VerificationEmailFailedError,
  InvalidCredentialsError,
  EmailNotVerifiedError,
  InvalidOrExpiredCodeError,
  StravaAlreadyLinkedError,
  InvalidOrExpiredResetTokenError,
  WeakPasswordError,
  InvalidRefreshTokenError,
  RefreshTokenReusedError,
  InvalidEmailError,
  EmailTakenError,
  register,
  verifyEmail,
  resendVerification,
  login,
  exchangeAuthCode,
  findOrCreateStravaUser,
  connectOura,
  linkStravaAccount,
  unlinkStrava,
  issueRefreshToken,
  rotateRefreshToken,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  changeEmail,
};
