// Folds a fresh, empty account into the account that owns a Strava athlete
// (docs/plans/auth-providers.md §3.5).
//
// The case it exists for: a rider whose account was created through Strava
// login taps "Sign in with Apple" on a new phone. Apple has never seen this
// account, so a new, empty one is made; when he then connects his Strava,
// the athlete turns out to belong to his old account. Finishing Strava's
// OAuth proves he controls that account — it is exactly how the account has
// been signed into until now — and his live session proves he controls the
// Apple/Google identity. So the identity moves to the old account and the
// shell is deleted. Nothing of the old account is touched except gaining a
// sign-in method.
const { withTransaction } = require('../db');
const logger = require('../lib/logger');
const accountRepo = require('../repositories/account');
const mergeRepo = require('../repositories/accountMerge');
const { DEFAULT_GOAL_TEMPLATES } = require('./userProfile');

const DEFAULT_GOAL_TITLES = DEFAULT_GOAL_TEMPLATES.map((template) => template.title);

// Each rule is a reason to leave both accounts alone; the caller then
// refuses the Strava connection with a message instead of merging.
function isMergeable(fresh, survivor) {
  if (!fresh || !survivor) return false;
  // Had Strava or Oura of its own at some point — not a shell.
  if (fresh.strava_athlete_id || fresh.oura_user_id) return false;
  // A password can only move together with its address, and the address
  // only into an empty slot: otherwise the rider's way of signing in would
  // silently disappear with the shell.
  if (fresh.password_hash && survivor.email) return false;
  return true;
}

/**
 * @returns {Promise<boolean>} true when `freshUserId` was merged into
 *   `survivorId` and no longer exists; false when the two were left as they are.
 */
async function mergeFreshAccountInto(freshUserId, survivorId) {
  const merged = await withTransaction(async (db) => {
    const users = await mergeRepo.lockUsers(db, [freshUserId, survivorId]);
    const fresh = users.get(freshUserId);
    const survivor = users.get(survivorId);

    if (!isMergeable(fresh, survivor)) return false;
    if (await mergeRepo.hasRiderData(db, freshUserId, DEFAULT_GOAL_TITLES)) return false;
    if (await mergeRepo.identitiesCollide(db, freshUserId, survivorId)) return false;

    await mergeRepo.moveIdentities(db, freshUserId, survivorId);
    // The shell goes first: its address is UNIQUE and has to be free before
    // the surviving account can take it.
    await accountRepo.deleteUserRows(db, freshUserId);
    if (fresh.email && !survivor.email) {
      await mergeRepo.adoptLogin(db, survivorId, {
        email: fresh.email,
        emailVerified: fresh.email_verified,
        passwordHash: fresh.password_hash,
      });
    }
    return true;
  });

  if (merged) logger.info({ freshUserId, survivorId }, '[accountMerge] fresh account merged into the Strava-owning account');
  return merged;
}

module.exports = { mergeFreshAccountInto };
