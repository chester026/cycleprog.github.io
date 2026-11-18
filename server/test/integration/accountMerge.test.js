const request = require('supertest');
const bcrypt = require('bcrypt');
const { bootstrap } = require('./setup');

// Strava connect: merge instead of refuse (docs/plans/auth-providers.md
// §3.5). A rider with a Strava-login account signs in with Apple/Google on a
// new phone, gets a fresh account, connects his Strava — and must end up in
// his old account with the new sign-in method attached. Strava's two API
// calls are spied; everything else is the real /link_strava round-trip.
describe('Strava connect merges a fresh account into the athlete\'s existing one', () => {
  let app, pool, createState, stravaOAuth, issueSessionToken;
  let athleteSeq = Date.now() * 100;

  const tokens = { access_token: 'merge-at', refresh_token: 'merge-rt', expires_at: 9999999999 };

  async function insertUser(fields = {}) {
    const columns = Object.keys(fields);
    const sql = columns.length
      ? `INSERT INTO users (${columns.join(', ')}, created_at) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}, NOW()) RETURNING *`
      : 'INSERT INTO users (created_at) VALUES (NOW()) RETURNING *';
    return (await pool.query(sql, Object.values(fields))).rows[0];
  }

  // The account as Strava login made it, with a goal so there is something to keep.
  async function stravaAccount(extra = {}) {
    const athleteId = String(++athleteSeq);
    const user = await insertUser({ strava_id: athleteId, strava_athlete_id: athleteId, name: 'Old Rider', ...extra });
    await pool.query("INSERT INTO goals (user_id, title, goal_type) VALUES ($1, 'Ride 500 km', 'distance')", [user.id]);
    return { ...user, athleteId };
  }

  // The account a first Apple/Google sign-in makes.
  async function freshAccount({ provider = 'apple', ...fields } = {}) {
    const user = await insertUser({ name: 'New Phone', ...fields });
    if (provider) {
      await pool.query(
        "INSERT INTO user_identities (user_id, provider, provider_user_id, email, email_verified) VALUES ($1, $2, $3, $4, TRUE)",
        [user.id, provider, `sub-${user.id}`, fields.email || null]
      );
    }
    // Onboarding has run by the time a new rider connects Strava — through
    // the real endpoint, so the account holds exactly what the app leaves
    // behind (a profile row and the four default goals).
    const onboarding = await request(app)
      .post('/api/user-profile/onboarding')
      .set('Authorization', `Bearer ${issueSessionToken(user)}`)
      .send({ onboarding_completed: true });
    expect(onboarding.status).toBe(200);
    return user;
  }

  async function connectStrava(user, athleteId, client = 'mobile') {
    stravaOAuth.getAthlete.mockResolvedValue({ id: athleteId, email: null, firstname: 'Strava', lastname: 'Name', profile: null });
    const state = await createState(pool, { purpose: 'link', userId: user.id, client });
    return request(app).get('/link_strava').query({ code: 'strava-code', state });
  }

  const exists = async (userId) => (await pool.query('SELECT 1 FROM users WHERE id = $1', [userId])).rowCount === 1;
  const providersOf = async (userId) =>
    (await pool.query('SELECT provider FROM user_identities WHERE user_id = $1 ORDER BY provider', [userId])).rows.map((r) => r.provider);

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ createState } = require('../../lib/oauthState'));
    ({ issueSessionToken } = require('../../lib/jwt'));
    stravaOAuth = require('../../services/strava/oauth');
  }, 30000);

  beforeEach(() => {
    vi.spyOn(stravaOAuth, 'exchangeCode').mockResolvedValue(tokens);
    vi.spyOn(stravaOAuth, 'getAthlete');
  });

  it('moves the sign-in method to the old account and hands the app a session for it', async () => {
    const old = await stravaAccount();
    const fresh = await freshAccount();

    const res = await connectStrava(fresh, old.athleteId);

    expect(res.status).toBe(302);
    const redirect = new URL(res.headers.location);
    expect(`${redirect.protocol}//${redirect.host}`).toBe('bikelab://strava-linked');
    expect(redirect.searchParams.get('ok')).toBe('1');

    expect(redirect.searchParams.get('attempt')).toBeTruthy();

    expect(await exists(fresh.id)).toBe(false);
    expect(await providersOf(old.id)).toEqual(['apple']);
    // The old account keeps its own goal and gains none of the shell's defaults.
    const goals = await pool.query('SELECT title FROM goals WHERE user_id = $1', [old.id]);
    expect(goals.rows).toEqual([{ title: 'Ride 500 km' }]);
    const survivor = (await pool.query('SELECT name, strava_access_token FROM users WHERE id = $1', [old.id])).rows[0];
    expect(survivor).toEqual({ name: 'Old Rider', strava_access_token: 'merge-at' });

    // The one-time code signs the app into the surviving account.
    const exchange = await request(app).post('/api/auth/exchange').send({ code: redirect.searchParams.get('code') });
    expect(exchange.status).toBe(200);
    expect(exchange.body.user.id).toBe(old.id);
    const methods = await request(app).get('/api/auth/identities').set('Authorization', `Bearer ${exchange.body.token}`);
    expect(methods.body).toMatchObject({ needs_sign_in_method: false });
  });

  it('reconnects an account that had disconnected Strava', async () => {
    const old = await stravaAccount();
    await pool.query('UPDATE users SET strava_id = NULL, strava_access_token = NULL WHERE id = $1', [old.id]);
    const fresh = await freshAccount({ provider: 'google' });

    const res = await connectStrava(fresh, old.athleteId);

    expect(new URL(res.headers.location).searchParams.get('code')).toBeTruthy();
    const survivor = (await pool.query('SELECT strava_id FROM users WHERE id = $1', [old.id])).rows[0];
    expect(survivor.strava_id).toBe(old.athleteId);
    expect(await providersOf(old.id)).toEqual(['google']);
  });

  it('gives the old account the fresh one\'s address when it had none', async () => {
    const old = await stravaAccount();
    const email = `merge-${Date.now()}@example.com`;
    const fresh = await freshAccount({ provider: 'google', email, email_verified: true });

    await connectStrava(fresh, old.athleteId);

    const survivor = (await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [old.id])).rows[0];
    expect(survivor).toEqual({ email, email_verified: true });
  });

  it('moves an email + password login into an account that has no address', async () => {
    const old = await stravaAccount();
    const email = `merge-pw-${Date.now()}@example.com`;
    const fresh = await freshAccount({ provider: null, email, email_verified: true, password_hash: await bcrypt.hash('Sup3rSecret!', 4) });

    const res = await connectStrava(fresh, old.athleteId);
    expect(new URL(res.headers.location).searchParams.get('code')).toBeTruthy();

    const login = await request(app).post('/api/login').send({ email, password: 'Sup3rSecret!' });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(old.id);
  });

  describe('leaves both accounts alone and refuses the connection', () => {
    async function expectRefused(fresh, old, client = 'mobile') {
      const res = await connectStrava(fresh, old.athleteId, client);
      if (client === 'mobile') {
        const redirect = new URL(res.headers.location);
        expect(redirect.searchParams.get('ok')).toBe('0');
        expect(redirect.searchParams.get('reason')).toBe('another_account');
        expect(redirect.searchParams.get('code')).toBeNull();
      } else {
        expect(res.status).toBe(400);
      }
      expect(await exists(fresh.id)).toBe(true);
      expect(await exists(old.id)).toBe(true);
      expect(await providersOf(old.id)).toEqual([]);
      const untouched = (await pool.query('SELECT strava_access_token FROM users WHERE id = $1', [old.id])).rows[0];
      expect(untouched.strava_access_token).toBeNull();
    }

    it('when the signed-in account has a goal of its own next to the defaults', async () => {
      const old = await stravaAccount();
      const fresh = await freshAccount();
      await pool.query("INSERT INTO goals (user_id, title, goal_type) VALUES ($1, 'Mine', 'distance')", [fresh.id]);
      await expectRefused(fresh, old);
    });

    it('when it has talked to the coach', async () => {
      const old = await stravaAccount();
      const fresh = await freshAccount();
      await pool.query("INSERT INTO coach_conversations (id, user_id, title) VALUES (gen_random_uuid(), $1, 'Chat')", [fresh.id]);
      await expectRefused(fresh, old);
    });

    it('with a link that differs on every attempt, so the app never drops a repeat as a duplicate', async () => {
      const old = await stravaAccount();
      const fresh = await freshAccount();
      await pool.query("INSERT INTO goals (user_id, title, goal_type) VALUES ($1, 'Mine', 'distance')", [fresh.id]);
      const first = await connectStrava(fresh, old.athleteId);
      const second = await connectStrava(fresh, old.athleteId);
      expect(first.headers.location).not.toBe(second.headers.location);
    });

    it('when its password could not move with it', async () => {
      const old = await stravaAccount({ email: `old-${Date.now()}@example.com` });
      const fresh = await freshAccount({
        provider: null,
        email: `fresh-${Date.now()}@example.com`,
        email_verified: true,
        password_hash: await bcrypt.hash('Sup3rSecret!', 4),
      });
      await expectRefused(fresh, old);
    });

    it('when the request comes from the web, which cannot swap its session yet', async () => {
      const old = await stravaAccount();
      const fresh = await freshAccount();
      await expectRefused(fresh, old, 'web');
    });
  });

  it('refuses when both accounts already sign in with the same provider', async () => {
    const old = await stravaAccount();
    await pool.query("INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, 'apple', $2)", [old.id, `old-sub-${old.id}`]);
    const fresh = await freshAccount({ provider: 'apple' });

    const res = await connectStrava(fresh, old.athleteId);

    expect(new URL(res.headers.location).searchParams.get('reason')).toBe('another_account');
    expect(await exists(fresh.id)).toBe(true);
    expect(await providersOf(fresh.id)).toEqual(['apple']);
  });
});
