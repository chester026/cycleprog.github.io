const {
  buildStravaAuthorizeUrl,
  createState,
  consumeState,
  createAuthCode,
  consumeAuthCode,
  STRAVA_SCOPE,
} = require('../lib/oauthState');

function fakePool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe('buildStravaAuthorizeUrl', () => {
  it('builds the canonical authorize URL with the single shared scope', () => {
    const url = buildStravaAuthorizeUrl({
      clientId: '12345',
      redirectUri: 'https://bikelab.app/exchange_token',
      state: 'abc123',
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://www.strava.com/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('12345');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://bikelab.app/exchange_token');
    expect(parsed.searchParams.get('state')).toBe('abc123');
    expect(parsed.searchParams.get('scope')).toBe(STRAVA_SCOPE);
    expect(parsed.searchParams.get('response_type')).toBe('code');
  });

  it('throws when a required param is missing', () => {
    expect(() => buildStravaAuthorizeUrl({ redirectUri: 'x', state: 'y' })).toThrow();
    expect(() => buildStravaAuthorizeUrl({ clientId: 'x', state: 'y' })).toThrow();
    expect(() => buildStravaAuthorizeUrl({ clientId: 'x', redirectUri: 'y' })).toThrow();
  });
});

describe('createState / consumeState', () => {
  it('inserts a login state with the given client and no userId', async () => {
    const pool = fakePool();
    const state = await createState(pool, { purpose: 'login', client: 'web' });
    expect(typeof state).toBe('string');
    expect(state.length).toBe(64); // 32 random bytes as hex

    const cleanupCall = pool.query.mock.calls[0];
    expect(cleanupCall[0]).toMatch(/DELETE FROM oauth_states WHERE expires_at/);

    const insertCall = pool.query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO oauth_states/);
    expect(insertCall[1][0]).toBe(state);
    expect(insertCall[1][1]).toBe('login');
    expect(insertCall[1][2]).toBe(null);
    expect(insertCall[1][3]).toBe('web');
  });

  it('inserts a link state carrying the userId', async () => {
    const pool = fakePool();
    const state = await createState(pool, { purpose: 'link', userId: 42, client: 'mobile' });
    const insertCall = pool.query.mock.calls[1];
    expect(insertCall[1]).toEqual([state, 'link', 42, 'mobile', expect.any(Date)]);
  });

  it('rejects an invalid purpose or client', async () => {
    const pool = fakePool();
    await expect(createState(pool, { purpose: 'bogus', client: 'web' })).rejects.toThrow();
    await expect(createState(pool, { purpose: 'login', client: 'bogus' })).rejects.toThrow();
  });

  it('consumeState deletes the row (single-use) and returns it', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ purpose: 'login', user_id: null, client: 'web' }] }) };
    const row = await consumeState(pool, 'sometoken');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM oauth_states WHERE state = \$1 AND expires_at >= NOW\(\) RETURNING/),
      ['sometoken']
    );
    expect(row).toEqual({ purpose: 'login', user_id: null, client: 'web' });
  });

  it('consumeState returns null for a missing/expired/already-used state', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const row = await consumeState(pool, 'gone');
    expect(row).toBeNull();
  });

  it('consumeState returns null without querying when state is falsy', async () => {
    const pool = fakePool();
    const row = await consumeState(pool, undefined);
    expect(row).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('createAuthCode / consumeAuthCode', () => {
  it('inserts an auth code tied to a userId', async () => {
    const pool = fakePool();
    const code = await createAuthCode(pool, 7);
    expect(typeof code).toBe('string');
    expect(code.length).toBe(64);
    const insertCall = pool.query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO auth_codes/);
    expect(insertCall[1]).toEqual([code, 7, expect.any(Date)]);
  });

  it('consumeAuthCode deletes the row (single-use) and returns the userId', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ user_id: 7 }] }) };
    const userId = await consumeAuthCode(pool, 'somecode');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM auth_codes WHERE code = \$1 AND expires_at >= NOW\(\) RETURNING/),
      ['somecode']
    );
    expect(userId).toBe(7);
  });

  it('consumeAuthCode returns null for a missing/expired/already-used code', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const userId = await consumeAuthCode(pool, 'gone');
    expect(userId).toBeNull();
  });

  it('consumeAuthCode returns null without querying when code is falsy', async () => {
    const pool = fakePool();
    const userId = await consumeAuthCode(pool, undefined);
    expect(userId).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
