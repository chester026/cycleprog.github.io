const crypto = require('crypto');

// Same require-cache trick as strava.tokens.test.js: externalHttp is a real
// axios instance; replacing .get before jwks.js uses it stubs the network.
const { externalHttp } = require('../lib/http');
externalHttp.get = vi.fn();

const jwks = require('../services/identity/jwks');

const URL = 'https://provider.example/keys';

function jwk(kid) {
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
}

describe('services/identity/jwks', () => {
  beforeEach(() => {
    externalHttp.get.mockReset();
    jwks._clearCacheForTests();
    vi.useRealTimers();
  });

  it('fetches the key set once and serves later lookups from memory', async () => {
    externalHttp.get.mockResolvedValue({ data: { keys: [jwk('a'), jwk('b')] } });

    const first = await jwks.getSigningKey(URL, 'a');
    const second = await jwks.getSigningKey(URL, 'b');

    expect(first.asymmetricKeyType).toBe('rsa');
    expect(second.asymmetricKeyType).toBe('rsa');
    expect(externalHttp.get).toHaveBeenCalledTimes(1);
  });

  it('answers null for an unknown kid without refetching inside a minute', async () => {
    externalHttp.get.mockResolvedValue({ data: { keys: [jwk('a')] } });

    expect(await jwks.getSigningKey(URL, 'a')).not.toBeNull();
    expect(await jwks.getSigningKey(URL, 'forged-1')).toBeNull();
    expect(await jwks.getSigningKey(URL, 'forged-2')).toBeNull();
    expect(externalHttp.get).toHaveBeenCalledTimes(1);
  });

  it('refetches for an unknown kid once the minute has passed (key rotation)', async () => {
    vi.useFakeTimers();
    externalHttp.get.mockResolvedValueOnce({ data: { keys: [jwk('old')] } });
    await jwks.getSigningKey(URL, 'old');

    vi.advanceTimersByTime(61 * 1000);
    externalHttp.get.mockResolvedValueOnce({ data: { keys: [jwk('old'), jwk('new')] } });

    expect(await jwks.getSigningKey(URL, 'new')).not.toBeNull();
    expect(externalHttp.get).toHaveBeenCalledTimes(2);
  });

  it('ignores keys that are not RSA or carry no kid', async () => {
    externalHttp.get.mockResolvedValue({ data: { keys: [{ kty: 'EC', kid: 'ec' }, { ...jwk('x'), kid: undefined }] } });
    expect(await jwks.getSigningKey(URL, 'ec')).toBeNull();
  });
});
