// test/setup-env.js sets no Apple/Google settings — exactly a deployment
// that has not been given any yet.
const apple = require('../services/identity/apple');
const google = require('../services/identity/google');

describe('sign-in providers without configuration', () => {
  it('report themselves as not configured', () => {
    expect(apple.isConfigured()).toBe(false);
    expect(apple.canManageTokens()).toBe(false);
    expect(google.isConfigured()).toBe(false);
  });

  it('answer 503 PROVIDER_NOT_CONFIGURED before looking at the token', async () => {
    await expect(apple.verifyIdentityToken('anything', 'nonce')).rejects.toMatchObject({ status: 503, code: 'PROVIDER_NOT_CONFIGURED' });
    await expect(google.verifyGoogleIdToken('anything', null)).rejects.toMatchObject({ status: 503, code: 'PROVIDER_NOT_CONFIGURED' });
  });

  it('skip the Apple token calls without the .p8 key', async () => {
    expect(await apple.exchangeAuthorizationCode('code', 'com.bikelab.app')).toBeNull();
    expect(await apple.revokeRefreshToken('token', 'com.bikelab.app')).toBe(false);
  });
});
