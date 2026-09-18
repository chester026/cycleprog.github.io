// User profile + onboarding + email-change routes (T-4.1 domain extraction).
// Moved verbatim from server.js: GET/PUT /api/user-profile,
// POST /api/user-profile/onboarding, POST /api/user-profile/email.
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { pool } = require('../db');
const { issueSessionToken } = require('../lib/jwt');
const { computeHrZones } = require('@bikelab/shared/calc');
const { UserProfileUpdateSchema, OnboardingBodySchema } = require('@bikelab/shared/types');
const { getUserProfile, updateUserProfile, completeOnboarding } = require('../recommendations');
const userProfileRepo = require('../repositories/userProfile');
const { createDefaultGoals } = require('../services/userProfile');
const authService = require('../services/auth');

patchAsyncRoutes(router);

// Получение профиля пользователя
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const profile = await getUserProfile(pool, userId);

    // Get user info from users table (name, avatar, etc.)
    const user = await userProfileRepo.getProfileUserFields(userId);

    // Combine profile data with user info
    const fullProfile = {
      ...profile,
      id: user?.id || userId,
      name: user?.name || null,
      avatar: user?.avatar || null,
      strava_id: user?.strava_id || null,
      email: user?.email || null,
      is_admin: user?.is_admin === true,
    };

    // hr_zones is always derived, never the stored/client-supplied value
    // (T-3.1) — ignore whatever `getUserProfile` returned for it.
    fullProfile.hr_zones = computeHrZones(fullProfile);

    res.json(fullProfile);
  } catch (error) {
    logger.error({ err: error }, 'Error getting user profile:');
    res.status(500).json({ error: 'Failed to get user profile', code: 'INTERNAL' });
  }
});

// Обновление профиля пользователя
router.put('/', authMiddleware, validateBody(UserProfileUpdateSchema), async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const profileData = req.body;

    // hr_zones is derived server-side (T-3.1) — clients used to send their
    // own computed value here; ignore it regardless of what's sent.
    delete profileData.hr_zones;

    // Валидация данных
    if (profileData.experience_level && !['beginner', 'intermediate', 'advanced'].includes(profileData.experience_level)) {
      return res.status(400).json({ error: 'Invalid experience level', code: 'VALIDATION_ERROR' });
    }

    if (profileData.time_available && (profileData.time_available < 1 || profileData.time_available > 10)) {
      return res.status(400).json({ error: 'Time available must be between 1 and 10 hours', code: 'VALIDATION_ERROR' });
    }

    // Валидация новых полей онбоардинга
    if (profileData.height && (profileData.height < 100 || profileData.height > 250)) {
      return res.status(400).json({ error: 'Height must be between 100 and 250 cm', code: 'VALIDATION_ERROR' });
    }

    if (profileData.weight && (profileData.weight < 30 || profileData.weight > 200)) {
      return res.status(400).json({ error: 'Weight must be between 30 and 200 kg', code: 'VALIDATION_ERROR' });
    }

    if (profileData.age && (profileData.age < 10 || profileData.age > 100)) {
      return res.status(400).json({ error: 'Age must be between 10 and 100 years', code: 'VALIDATION_ERROR' });
    }

    if (profileData.bike_weight && (profileData.bike_weight < 5 || profileData.bike_weight > 25)) {
      return res.status(400).json({ error: 'Bike weight must be between 5 and 25 kg', code: 'VALIDATION_ERROR' });
    }

    const updatedProfile = await updateUserProfile(pool, userId, profileData);

    // Update email in users table if provided
    if (profileData.email !== undefined) {
      await userProfileRepo.setEmail(userId, profileData.email);
    }

    // Get Strava info and email from users table
    const { strava_id, email } = await userProfileRepo.getStravaIdAndEmail(userId);

    // Combine profile data with Strava info and email
    const fullProfile = {
      ...updatedProfile,
      strava_id: strava_id,
      email: email,
    };

    // hr_zones is always derived (T-3.1), same as GET /api/user-profile.
    fullProfile.hr_zones = computeHrZones(fullProfile);

    res.json(fullProfile);
  } catch (error) {
    logger.error({ err: error }, 'Error updating user profile:');
    res.status(500).json({ error: 'Failed to update user profile', code: 'INTERNAL' });
  }
});

// Завершение онбоардинга
router.post('/onboarding', authMiddleware, validateBody(OnboardingBodySchema), async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const onboardingData = req.body;

    // hr_zones is derived server-side (T-3.1) — ignore any client-sent value.
    delete onboardingData.hr_zones;

    // completeOnboarding() only UPDATEs user_profiles; a user whose row was
    // never lazily created (no prior GET /api/user-profile — e.g. the app's
    // onboarding-first flow) would otherwise get a 200 with nothing saved.
    // getUserProfile() creates the default row when missing.
    await getUserProfile(pool, userId);

    // Если это только skip (только onboarding_completed), пропускаем валидацию
    if (onboardingData.onboarding_completed && Object.keys(onboardingData).length === 1) {
      const completedProfile = await completeOnboarding(pool, userId, onboardingData);

      // Создаем дефолтные цели с intermediate уровнем для пользователей, пропустивших onboarding
      await createDefaultGoals(userId, 'intermediate');

      completedProfile.hr_zones = computeHrZones(completedProfile);

      res.json(completedProfile);
      return;
    }

    // Валидация данных онбоардинга
    if (onboardingData.height && (onboardingData.height < 100 || onboardingData.height > 250)) {
      return res.status(400).json({ error: 'Height must be between 100 and 250 cm', code: 'VALIDATION_ERROR' });
    }

    if (onboardingData.weight && (onboardingData.weight < 30 || onboardingData.weight > 200)) {
      return res.status(400).json({ error: 'Weight must be between 30 and 200 kg', code: 'VALIDATION_ERROR' });
    }

    if (onboardingData.age && (onboardingData.age < 10 || onboardingData.age > 100)) {
      return res.status(400).json({ error: 'Age must be between 10 and 100 years', code: 'VALIDATION_ERROR' });
    }

    if (onboardingData.bike_weight && (onboardingData.bike_weight < 5 || onboardingData.bike_weight > 25)) {
      return res.status(400).json({ error: 'Bike weight must be between 5 and 25 kg', code: 'VALIDATION_ERROR' });
    }

    if (onboardingData.experience_level && !['beginner', 'intermediate', 'advanced'].includes(onboardingData.experience_level)) {
      return res.status(400).json({ error: 'Invalid experience level', code: 'VALIDATION_ERROR' });
    }

    if (onboardingData.max_hr && (onboardingData.max_hr < 100 || onboardingData.max_hr > 220)) {
      return res.status(400).json({ error: 'Max HR must be between 100 and 220 bpm', code: 'VALIDATION_ERROR' });
    }

    if (onboardingData.resting_hr && (onboardingData.resting_hr < 40 || onboardingData.resting_hr > 100)) {
      return res.status(400).json({ error: 'Resting HR must be between 40 and 100 bpm', code: 'VALIDATION_ERROR' });
    }

    if (onboardingData.lactate_threshold && (onboardingData.lactate_threshold < 120 || onboardingData.lactate_threshold > 200)) {
      return res.status(400).json({ error: 'Lactate Threshold must be between 120 and 200 bpm', code: 'VALIDATION_ERROR' });
    }

    const completedProfile = await completeOnboarding(pool, userId, onboardingData);

    // Создаем дефолтные цели для нового пользователя
    if (onboardingData.experience_level) {
      await createDefaultGoals(userId, onboardingData.experience_level);
    }

    // Get Strava info from users table
    const strava_id = await userProfileRepo.getStravaId(userId);

    // Combine profile data with Strava info
    const fullProfile = {
      ...completedProfile,
      strava_id: strava_id,
    };

    // hr_zones is always derived (T-3.1), same as GET /api/user-profile.
    fullProfile.hr_zones = computeHrZones(fullProfile);

    res.json(fullProfile);
  } catch (error) {
    logger.error({ err: error }, '❌ Error completing onboarding:');
    res.status(500).json({ error: 'Failed to complete onboarding', code: 'INTERNAL' });
  }
});

// Обновление email для пользователей Strava
//
// T-4.5 (S-27): the actual validation/normalisation/conflict-check/re-
// verification logic now lives in services/auth.js's changeEmail — see that
// function's own comment for exactly what behaviour this replaces (it used
// to accept any "@"-containing string un-normalised, 400 EMAIL_ALREADY_
// EXISTS on conflict, and leave email_verified untouched). This route keeps
// the same response shape ({success, message, token}) on success; the
// conflict case is now 409 EMAIL_TAKEN instead of 400 EMAIL_ALREADY_EXISTS.
router.post('/email', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { email } = req.body;

    const user = await authService.changeEmail(userId, email);

    // Генерируем новый JWT с обновленным email
    const newToken = issueSessionToken(user);

    res.json({
      success: true,
      message: 'Email updated. Please check your inbox to verify your new address.',
      token: newToken,
    });
  } catch (error) {
    if (error instanceof authService.InvalidEmailError) {
      return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
    }
    if (error instanceof authService.EmailTakenError) {
      return res.status(409).json({ error: error.message, code: 'EMAIL_TAKEN' });
    }
    logger.error({ err: error }, '❌ Error updating email:');
    res.status(500).json({ error: 'Failed to update email', code: 'INTERNAL' });
  }
});

module.exports = router;
