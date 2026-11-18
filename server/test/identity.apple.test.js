const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Config is read at first require — the Apple settings have to be in the env
// before anything below loads it.
const teamKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
process.env.APPLE_BUNDLE_ID = 'com.bikelab.test';
process.env.APPLE_TEAM_ID = 'TEAM123456';
process.env.APPLE_KEY_ID = 'KEY1234567';
// As a one-line env var holds it: newlines escaped.
process.env.APPLE_PRIVATE_KEY = teamKey.privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n');

const { externalHttp } = require('../lib/http');
externalHttp.post = vi.fn();

const apple = require('../services/identity/apple');

function lastForm() {
  const [url, body, options] = externalHttp.post.mock.calls.at(-1);
  return { url, form: Object.fromEntries(new URLSearchParams(body)), options };
}

describe('services/identity/apple — token and revoke calls', () => {
  // Block body on purpose: a function returned from beforeEach is run as its
  // cleanup, and mockReset() returns the mock.
  beforeEach(() => {
    externalHttp.post.mockReset();
  });

  it('trades the authorization code for a refresh token, authenticated with a signed client secret', async () => {
    externalHttp.post.mockResolvedValue({ data: { refresh_token: 'r-1' } });

    expect(await apple.exchangeAuthorizationCode('code-1', 'com.bikelab.test')).toBe('r-1');

    const { url, form, options } = lastForm();
    expect(url).toBe('https://appleid.apple.com/auth/token');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(form).toMatchObject({ client_id: 'com.bikelab.test', code: 'code-1', grant_type: 'authorization_code' });

    // The secret is an ES256 JWT only the team's .p8 key could have signed.
    const secret = jwt.verify(form.client_secret, teamKey.publicKey, { algorithms: ['ES256'], complete: true });
    expect(secret.header.kid).toBe('KEY1234567');
    expect(secret.payload).toMatchObject({ iss: 'TEAM123456', sub: 'com.bikelab.test', aud: 'https://appleid.apple.com' });
    expect(secret.payload.exp - secret.payload.iat).toBeLessThanOrEqual(300);
  });

  it('returns null instead of throwing when Apple refuses the code', async () => {
    externalHttp.post.mockRejectedValue(Object.assign(new Error('400'), { response: { data: { error: 'invalid_grant' } } }));
    expect(await apple.exchangeAuthorizationCode('used-code', 'com.bikelab.test')).toBeNull();
  });

  it('makes no call without a code', async () => {
    expect(await apple.exchangeAuthorizationCode(null, 'com.bikelab.test')).toBeNull();
    expect(externalHttp.post).not.toHaveBeenCalled();
  });

  it('revokes a refresh token', async () => {
    externalHttp.post.mockResolvedValue({ data: '' });

    expect(await apple.revokeRefreshToken('r-1', 'com.bikelab.test')).toBe(true);

    const { url, form } = lastForm();
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    expect(form).toMatchObject({ client_id: 'com.bikelab.test', token: 'r-1', token_type_hint: 'refresh_token' });
  });

  it('reports a failed revoke as false', async () => {
    externalHttp.post.mockRejectedValue(new Error('timeout'));
    expect(await apple.revokeRefreshToken('r-1', 'com.bikelab.test')).toBe(false);
    expect(await apple.revokeRefreshToken(null, 'com.bikelab.test')).toBe(false);
  });
});
