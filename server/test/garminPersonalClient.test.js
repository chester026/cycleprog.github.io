const { createGarminPersonalClient, GarminPersonalApiError, BASE_URL, TOKEN_PATH } = require('../services/garminConnect/personalClient');

const KEY = 'secret-personal-key';
const jwt = (expSeconds) => `h.${Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url')}.s`;

function httpError(status) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data: { message: 'nope' } };
  err.config = { headers: { Authorization: `ApiKey ${KEY}` } };
  return err;
}

describe('Garmin Personal API client', () => {
  const NOW = 1_800_000_000_000;
  let http;
  const make = (now = () => NOW) => createGarminPersonalClient({ apiKey: KEY, http, now });

  beforeEach(() => {
    http = { post: vi.fn(), get: vi.fn() };
  });

  it('refuses to exist without a key', () => {
    expect(() => createGarminPersonalClient({ apiKey: '', http })).toThrow(GarminPersonalApiError);
  });

  it('exchanges the key for a bearer token and sends it on GETs', async () => {
    const token = jwt(NOW / 1000 + 24 * 3600);
    http.post.mockResolvedValue({ data: { access_token: token } });
    http.get.mockResolvedValue({ data: [{ activityId: 1 }] });

    const client = make();
    const data = await client.get('/activitylist-service/activities/search/activities', { start: 0, limit: 20 });

    expect(data).toEqual([{ activityId: 1 }]);
    expect(http.post).toHaveBeenCalledWith(`${BASE_URL}${TOKEN_PATH}`, null, {
      headers: { Authorization: `ApiKey ${KEY}`, Accept: 'application/json, text/plain, */*' },
    });
    const [url, options] = http.get.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/activitylist-service/activities/search/activities`);
    expect(options.headers.Authorization).toBe(`Bearer ${token}`);
    // A JSON-only Accept is what the token endpoint answered 406 to.
    expect(options.headers.Accept).toContain('*/*');
    expect(options.params).toEqual({ start: 0, limit: 20 });
    expect(client.tokenExpiresAt()).toBe(NOW + 24 * 3600 * 1000);
  });

  it('reuses the token until an hour before it expires, then exchanges again', async () => {
    let now = NOW;
    http.post
      .mockResolvedValueOnce({ data: jwt(NOW / 1000 + 24 * 3600) }) // a bare JWT string is accepted too
      .mockResolvedValueOnce({ data: { accessToken: jwt(NOW / 1000 + 48 * 3600) } });
    http.get.mockResolvedValue({ data: {} });
    const client = make(() => now);

    await client.get('/a-service/x');
    now = NOW + 22 * 3600 * 1000;
    await client.get('/a-service/x');
    expect(http.post).toHaveBeenCalledTimes(1);

    now = NOW + 23.5 * 3600 * 1000;
    await client.get('/a-service/x');
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('falls back to a 23 h lifetime when the token is not a JWT', async () => {
    http.post.mockResolvedValue({ data: { token: 'opaque' } });
    const client = make();
    await client.getToken();
    expect(client.tokenExpiresAt()).toBe(NOW + 23 * 3600 * 1000);
  });

  it('downloads the activity archive as a Buffer', async () => {
    http.post.mockResolvedValue({ data: jwt(NOW / 1000 + 24 * 3600) });
    http.get.mockResolvedValue({ data: new Uint8Array([0x50, 0x4b, 5, 6]).buffer });
    const zip = await make().downloadActivityZip(42);
    expect(Buffer.isBuffer(zip)).toBe(true);
    expect([...zip]).toEqual([0x50, 0x4b, 5, 6]);
    const [url, options] = http.get.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/download-service/files/activity/42`);
    expect(options.responseType).toBe('arraybuffer');
  });

  it('wraps failures without leaking the key, the token or the response body', async () => {
    http.post.mockRejectedValueOnce(httpError(401));
    const client = make();
    const tokenErr = await client.getToken().catch((e) => e);
    expect(tokenErr).toBeInstanceOf(GarminPersonalApiError);
    expect(tokenErr).toMatchObject({ status: 401, path: TOKEN_PATH });

    const token = jwt(NOW / 1000 + 24 * 3600);
    http.post.mockResolvedValue({ data: token });
    http.get.mockRejectedValue(httpError(429));
    const getErr = await client.get('/hrv-service/hrv/2026-11-09').catch((e) => e);
    expect(getErr).toMatchObject({ status: 429, path: '/hrv-service/hrv/2026-11-09' });

    const network = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    http.get.mockRejectedValue(network);
    const netErr = await client.get('/x-service/y').catch((e) => e);
    expect(netErr.status).toBeNull();

    for (const err of [tokenErr, getErr, netErr]) {
      const dump = JSON.stringify({ ...err, message: err.message, stack: err.stack });
      expect(dump).not.toContain(KEY);
      expect(dump).not.toContain(token);
      expect(dump).not.toContain('nope');
      expect(err.config).toBeUndefined();
      expect(err.response).toBeUndefined();
    }
  });

  it('reports a token response that carries no token', async () => {
    http.post.mockResolvedValue({ data: {} });
    await expect(make().getToken()).rejects.toThrow('had no token');
  });
});
