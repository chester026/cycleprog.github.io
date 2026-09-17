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
const logger = require('../lib/logger');
const { generateVerificationToken, sendVerificationEmail } = require('../brevo-config');
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

// POST /api/register
async function register({ email, password, name }) {
  const existingUser = await usersRepo.findIdByEmail(email);
  if (existingUser) throw new EmailAlreadyExistsError('User with this email already exists');

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await usersRepo.insertUser({ email, passwordHash: hashedPassword, name });

  const verificationToken = generateVerificationToken();
  await usersRepo.setVerificationToken(user.id, verificationToken);

  await sendVerificationEmail(email, verificationToken, name);

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

  const verificationToken = generateVerificationToken();
  const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа
  await usersRepo.setVerificationTokenWithExpiry(user.id, verificationToken, tokenExpires);

  const emailSent = await sendVerificationEmail(email, verificationToken);
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
  stravaActivities.invalidate(userId);
  stravaActivities.invalidateBikes(userId);
  // Очищаем серверный кэш Strava activities и велосипедов для этого пользователя
  activitiesCache.delete(userId);
  bikesCache.delete(userId);
  // Получаем обновлённого пользователя
  const user = await usersRepo.findById(userId);
  // Генерируем новый JWT без strava_id
  return issueSessionToken(user);
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
  register,
  verifyEmail,
  resendVerification,
  login,
  exchangeAuthCode,
  findOrCreateStravaUser,
  connectOura,
  linkStravaAccount,
  unlinkStrava,
};
