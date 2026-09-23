const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('user profile / onboarding / email', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    // T-4.5: POST /api/user-profile/email now sends a verification email
    // (services/auth.js's changeEmail) — mock the shared outbound axios
    // instance the same way auth.test.js does, so that call resolves
    // locally instead of ever reaching the real network.
    const httpLib = require('../../lib/http');
    httpLib.externalHttp.post = async () => ({ data: { messageId: 'test-message-id' } });
  }, 30000);

  describe('auth guard', () => {
    it('401s without a token on every route', async () => {
      const getRes = await request(app).get('/api/user-profile');
      expect(getRes.status).toBe(401);
      expect(getRes.body.code).toBe('UNAUTHORIZED');

      const putRes = await request(app).put('/api/user-profile').send({ experience_level: 'advanced' });
      expect(putRes.status).toBe(401);
      expect(putRes.body.code).toBe('UNAUTHORIZED');

      const onboardingRes = await request(app)
        .post('/api/user-profile/onboarding')
        .send({ onboarding_completed: true });
      expect(onboardingRes.status).toBe(401);
      expect(onboardingRes.body.code).toBe('UNAUTHORIZED');

      const emailRes = await request(app).post('/api/user-profile/email').send({ email: 'x@example.com' });
      expect(emailRes.status).toBe(401);
      expect(emailRes.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET/PUT /api/user-profile round-trip', () => {
    it('GET returns a default profile merged with user fields, PUT updates and re-derives hr_zones', async () => {
      const user = await createUser(pool, app, request);

      const getRes = await request(app)
        .get('/api/user-profile')
        .set('Authorization', `Bearer ${user.token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(user.id);
      expect(getRes.body.email).toBe(user.email);
      expect(getRes.body.experience_level).toBe('intermediate');
      expect(getRes.body.is_admin).toBe(false);
      // hr_zones is always derived (T-3.1) and computeHrZones() always falls
      // back to a flat 190bpm max-HR method when nothing else is known, so
      // it's never null/absent even on a brand new profile.
      expect(getRes.body.hr_zones).toBeTruthy();
      expect(getRes.body.hr_zones.method).toBe('maxhr');
      expect(getRes.body.hr_zones.basis.max_hr).toBe(190);

      const putRes = await request(app)
        .put('/api/user-profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ experience_level: 'advanced', height: 180, weight: 75, age: 30, max_hr: 190, resting_hr: 55 });
      expect(putRes.status).toBe(200);
      expect(putRes.body.experience_level).toBe('advanced');
      expect(putRes.body.height).toBe(180);
      // hr_zones is now derivable from max_hr, and is always server-computed
      // (T-3.1) — never whatever (nonexistent) value the client sent.
      expect(putRes.body.hr_zones).toBeTruthy();
      expect(putRes.body.hr_zones.basis.max_hr).toBe(190);

      // A client-supplied hr_zones must never come back verbatim.
      const putWithBogusHrZones = await request(app)
        .put('/api/user-profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ hr_zones: { method: 'maxhr', basis: { max_hr: 1 }, zones: [] } });
      expect(putWithBogusHrZones.status).toBe(200);
      expect(putWithBogusHrZones.body.hr_zones.basis.max_hr).toBe(190);

      // Re-fetching reflects the update.
      const getAgain = await request(app)
        .get('/api/user-profile')
        .set('Authorization', `Bearer ${user.token}`);
      expect(getAgain.status).toBe(200);
      expect(getAgain.body.experience_level).toBe('advanced');

      // PUT validates out-of-range fields with 400 VALIDATION_ERROR (same
      // user, to stay under the auth rate limiter's per-IP login budget).
      const badExperience = await request(app)
        .put('/api/user-profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ experience_level: 'expert' });
      expect(badExperience.status).toBe(400);
      expect(badExperience.body.code).toBe('VALIDATION_ERROR');

      const badWeight = await request(app)
        .put('/api/user-profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ weight: 1000 });
      expect(badWeight.status).toBe(400);
      expect(badWeight.body.code).toBe('VALIDATION_ERROR');

      // birth_date derives age (mirrored into the legacy `age` column too,
      // for clients — the current App Store build — that only read `age`
      // directly). Reuses `user` rather than creating a new one, to stay
      // under the auth rate limiter's per-IP login budget (see badWeight's
      // comment above) — same reasoning, same file.
      const putBirthDate = await request(app)
        .put('/api/user-profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ birth_date: '1991-09-23' });
      expect(putBirthDate.status).toBe(200);
      expect(putBirthDate.body.birth_date).toBe('1991-09-23');
      // Age depends on "today" — derive the expectation the same way
      // ageFromBirthDate does, rather than pinning a number that goes stale.
      const now = new Date();
      const expectedAge = now.getFullYear() - 1991 - (now < new Date(now.getFullYear(), 8, 23) ? 1 : 0);
      expect(putBirthDate.body.age).toBe(expectedAge);

      const row = await pool.query('SELECT age, birth_date FROM user_profiles WHERE user_id = $1', [user.id]);
      expect(row.rows[0].age).toBe(expectedAge);
      expect(row.rows[0].birth_date).toBe('1991-09-23');

      const badFormat = await request(app)
        .put('/api/user-profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ birth_date: 'not-a-date' });
      expect(badFormat.status).toBe(400);
      expect(badFormat.body.code).toBe('VALIDATION_ERROR');

      // A syntactically valid date whose derived age is out of range (< 10).
      const tooYoung = new Date();
      tooYoung.setFullYear(tooYoung.getFullYear() - 1);
      const badAge = await request(app)
        .put('/api/user-profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ birth_date: tooYoung.toISOString().slice(0, 10) });
      expect(badAge.status).toBe(400);
      expect(badAge.body.code).toBe('VALIDATION_ERROR');
    });

    it('PUT can change the email, and it is reflected on GET', async () => {
      const user = await createUser(pool, app, request);
      const newEmail = `changed-${Date.now()}@example.com`;

      const putRes = await request(app)
        .put('/api/user-profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ email: newEmail });
      expect(putRes.status).toBe(200);
      expect(putRes.body.email).toBe(newEmail);

      const row = await pool.query('SELECT email FROM users WHERE id = $1', [user.id]);
      expect(row.rows[0].email).toBe(newEmail);
    });
  });

  describe('POST /api/user-profile/onboarding', () => {
    it('completes onboarding and creates default goals scaled by experience level', async () => {
      const user = await createUser(pool, app, request);
      // Real clients always GET the profile on load first, which lazily
      // creates the `user_profiles` row `completeOnboarding`'s UPDATE
      // needs to actually persist anything (see the dedicated bug test
      // below for what happens without this).
      await request(app).get('/api/user-profile').set('Authorization', `Bearer ${user.token}`);

      const res = await request(app)
        .post('/api/user-profile/onboarding')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          experience_level: 'advanced',
          height: 182,
          weight: 78,
          age: 28,
          bike_weight: 8,
          max_hr: 195,
          resting_hr: 50,
          lactate_threshold: 170,
          onboarding_completed: true,
        });
      expect(res.status).toBe(200);
      expect(res.body.onboarding_completed).toBe(true);
      expect(res.body.hr_zones).toBeTruthy();

      const goalsRes = await pool.query(
        'SELECT goal_type, target_value, unit FROM goals WHERE user_id = $1 ORDER BY goal_type',
        [user.id]
      );
      expect(goalsRes.rows.length).toBe(4);
      const ftpGoal = goalsRes.rows.find((g) => g.goal_type === 'ftp_vo2max');
      expect(Number(ftpGoal.target_value)).toBe(180); // advanced tier value

      // Onboarding again (still 1 experience_level trigger) must not create
      // duplicate goals — createDefaultGoals() is a no-op once goals exist.
      await request(app)
        .post('/api/user-profile/onboarding')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ experience_level: 'beginner' });
      const goalsAfter = await pool.query('SELECT id FROM goals WHERE user_id = $1', [user.id]);
      expect(goalsAfter.rows.length).toBe(4);
    });

    it('skip-onboarding ({onboarding_completed: true} alone) creates intermediate-tier default goals', async () => {
      const user = await createUser(pool, app, request);
      await request(app).get('/api/user-profile').set('Authorization', `Bearer ${user.token}`);

      const res = await request(app)
        .post('/api/user-profile/onboarding')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ onboarding_completed: true });
      expect(res.status).toBe(200);
      expect(res.body.onboarding_completed).toBe(true);

      const goalsRes = await pool.query(
        'SELECT goal_type, target_value FROM goals WHERE user_id = $1 ORDER BY goal_type',
        [user.id]
      );
      expect(goalsRes.rows.length).toBe(4);
      const ftpGoal = goalsRes.rows.find((g) => g.goal_type === 'ftp_vo2max');
      expect(Number(ftpGoal.target_value)).toBe(120); // intermediate tier value
    });

    it('validates out-of-range onboarding fields with 400 VALIDATION_ERROR', async () => {
      const user = await createUser(pool, app, request);

      const res = await request(app)
        .post('/api/user-profile/onboarding')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ experience_level: 'intermediate', max_hr: 5 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');

      const goalsRes = await pool.query('SELECT id FROM goals WHERE user_id = $1', [user.id]);
      expect(goalsRes.rows.length).toBe(0);
    });

    it('persists onboarding even when no user_profiles row existed yet (row is created first), and accepts birth_date', async () => {
      const user = await createUser(pool, app, request);

      const res = await request(app)
        .post('/api/user-profile/onboarding')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ experience_level: 'advanced', height: 182, max_hr: 190, birth_date: '1995-03-10' });
      expect(res.status).toBe(200);
      expect(res.body.height).toBe(182);
      expect(res.body.max_hr).toBe(190);
      expect(res.body.birth_date).toBe('1995-03-10');
      expect(typeof res.body.age).toBe('number');

      const row = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [user.id]);
      expect(row.rows.length).toBe(1);
      expect(row.rows[0].experience_level).toBe('advanced');
      expect(row.rows[0].onboarding_completed).toBe(true);
      expect(row.rows[0].birth_date).toBe('1995-03-10');
      // birth_date mirrors into the legacy `age` column too (T-7.1 follow-up).
      expect(row.rows[0].age).toBe(res.body.age);
    });
  });

  describe('POST /api/user-profile/email', () => {
    it('rejects a missing/invalid email', async () => {
      const user = await createUser(pool, app, request);

      const missing = await request(app)
        .post('/api/user-profile/email')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe('VALIDATION_ERROR');

      const invalid = await request(app)
        .post('/api/user-profile/email')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ email: 'not-an-email' });
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('VALIDATION_ERROR');
    });

    // T-4.5 (S-27): was 400 EMAIL_ALREADY_EXISTS — see services/auth.js's
    // changeEmail for the full list of behaviour this replaces.
    it('rejects an email already used by another account with 409 EMAIL_TAKEN', async () => {
      const userA = await createUser(pool, app, request);
      const userB = await createUser(pool, app, request);

      const res = await request(app)
        .post('/api/user-profile/email')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ email: userB.email });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('updates the email, returns a new usable token, and re-verification is required (T-4.5, S-27)', async () => {
      const user = await createUser(pool, app, request);
      // Deliberately mixed-case with surrounding whitespace — changeEmail
      // trims/lowercases before storing (T-4.5).
      const newEmail = `  New-${Date.now()}@Example.com  `;
      const normalizedEmail = newEmail.trim().toLowerCase();

      const res = await request(app)
        .post('/api/user-profile/email')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ email: newEmail });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token).not.toBe(user.token);

      const row = await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [user.id]);
      expect(row.rows[0].email).toBe(normalizedEmail);
      // Was left at its previous value before T-4.5 (the old address's
      // verification did not carry over to prove the NEW address) — now
      // always false until the fresh verification link is clicked.
      expect(row.rows[0].email_verified).toBe(false);

      // The freshly issued token itself works for an authenticated route.
      const getRes = await request(app)
        .get('/api/user-profile')
        .set('Authorization', `Bearer ${res.body.token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.email).toBe(normalizedEmail);
    });
  });
});
