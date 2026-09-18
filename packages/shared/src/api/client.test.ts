import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApiClient } from './client.js';
import { ApiError, isApiError } from './errors.js';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200;
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

describe('createApiClient', () => {
  it('adds the Authorization header when a token is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      getToken: () => 'abc123',
      fetch: fetchMock,
      validateResponses: true,
    });

    await client.get('/api/thing');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/api/thing');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc123');
  });

  it('supports an async getToken', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient({
      baseUrl: '',
      getToken: async () => 'async-token',
      fetch: fetchMock,
      validateResponses: true,
    });

    await client.get('/x');
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer async-token');
  });

  it('omits the Authorization header when there is no token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient({
      baseUrl: '',
      getToken: () => null,
      fetch: fetchMock,
      validateResponses: true,
    });

    await client.get('/x');
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('JSON-encodes a plain object body and sets the content-type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient({
      baseUrl: '',
      getToken: () => null,
      fetch: fetchMock,
      validateResponses: true,
    });

    await client.post('/x', { a: 1 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('leaves a FormData body untouched and does not set content-type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient({
      baseUrl: '',
      getToken: () => null,
      fetch: fetchMock,
      validateResponses: true,
    });

    const formData = new FormData();
    formData.append('file', 'contents');
    await client.upload('/upload', formData);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(formData);
    expect((init.headers as Record<string, string> | undefined)?.['Content-Type']).toBeUndefined();
  });

  it('calls onUnauthorized exactly once and throws an ApiError with the body code on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Session expired', code: 'TOKEN_EXPIRED' }, { status: 401 }),
    );
    const onUnauthorized = vi.fn().mockResolvedValue(undefined);
    const client = createApiClient({
      baseUrl: '',
      getToken: () => 'stale-token',
      onUnauthorized,
      fetch: fetchMock,
      validateResponses: true,
    });

    await expect(client.get('/protected')).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_EXPIRED',
      message: 'Session expired',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    const passedErr = onUnauthorized.mock.calls[0][0];
    expect(isApiError(passedErr)).toBe(true);
  });

  it('normalizes the legacy {error:true, message} error body shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: true, message: 'Something legacy broke' }, { status: 500 }),
    );
    const client = createApiClient({
      baseUrl: '',
      getToken: () => null,
      fetch: fetchMock,
      validateResponses: true,
    });

    await expect(client.get('/legacy')).rejects.toMatchObject({
      status: 500,
      message: 'Something legacy broke',
      code: null,
    });
  });

  it('resolves undefined for a 204 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: '',
      getToken: () => null,
      fetch: fetchMock,
      validateResponses: true,
    });

    await expect(client.del('/x')).resolves.toBeUndefined();
  });

  it('throws a TIMEOUT ApiError when the request exceeds timeoutMs', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    const client = createApiClient({
      baseUrl: '',
      getToken: () => null,
      fetch: fetchMock,
      validateResponses: true,
      timeoutMs: 5,
    });

    await expect(client.get('/slow')).rejects.toMatchObject({
      status: 0,
      code: 'TIMEOUT',
    });
  });

  it('rejects when the caller-supplied AbortSignal aborts', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    const client = createApiClient({
      baseUrl: '',
      getToken: () => null,
      fetch: fetchMock,
      validateResponses: true,
      timeoutMs: 60000,
    });

    const controller = new AbortController();
    const promise = client.get('/slow', { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toThrow();
    await expect(promise).rejects.not.toMatchObject({ code: 'TIMEOUT' });
  });

  it('throws NETWORK_ERROR for a plain fetch rejection', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createApiClient({
      baseUrl: '',
      getToken: () => null,
      fetch: fetchMock,
      validateResponses: true,
    });

    await expect(client.get('/x')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  describe('schema validation', () => {
    const schema = z.object({ id: z.number() });

    it('throws RESPONSE_SCHEMA_MISMATCH when validateResponses is true and the body fails the schema', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'not-a-number' }));
      const client = createApiClient({
        baseUrl: '',
        getToken: () => null,
        fetch: fetchMock,
        validateResponses: true,
      });

      await expect(client.get('/x', { schema })).rejects.toMatchObject({
        code: 'RESPONSE_SCHEMA_MISMATCH',
      });
    });

    it('skips schema enforcement (but still returns data) when validateResponses is false', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'not-a-number' }));
      const client = createApiClient({
        baseUrl: '',
        getToken: () => null,
        fetch: fetchMock,
        validateResponses: false,
      });

      await expect(client.get('/x', { schema })).resolves.toEqual({ id: 'not-a-number' });
    });

    it('passes through parsed data when the schema matches', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 42 }));
      const client = createApiClient({
        baseUrl: '',
        getToken: () => null,
        fetch: fetchMock,
        validateResponses: true,
      });

      await expect(client.get('/x', { schema })).resolves.toEqual({ id: 42 });
    });
  });
});

describe('createApiClient refresh flow (T-4.5)', () => {
  it('refreshes once on a 401, then retries the original request and succeeds', async () => {
    const fetchMock = vi.fn();
    // 1st call: the original request, 401.
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, { status: 401 }));
    // 2nd call: POST /api/auth/refresh, 200.
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'new-token', refreshToken: 'new-refresh' }));
    // 3rd call: the retried original request, 200.
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const onTokens = vi.fn();
    const onUnauthorized = vi.fn();
    let currentToken = 'stale-token';

    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      getToken: () => currentToken,
      onUnauthorized,
      fetch: fetchMock,
      validateResponses: true,
      refresh: {
        getRefreshToken: () => 'stale-refresh',
        onTokens: (token, refreshToken) => {
          currentToken = token;
          onTokens(token, refreshToken);
        },
      },
    });

    await expect(client.get('/api/thing')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onTokens).toHaveBeenCalledWith('new-token', 'new-refresh');
    expect(onUnauthorized).not.toHaveBeenCalled();

    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1];
    expect(refreshUrl).toBe('https://api.example.com/api/auth/refresh');
    expect(JSON.parse(refreshInit.body as string)).toEqual({ refreshToken: 'stale-refresh' });

    // The retried request carries the NEW token, not the stale one.
    const [, retryInit] = fetchMock.mock.calls[2];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer new-token');
  });

  it('deduplicates concurrent 401s into a single refresh call', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired' }, { status: 401 })); // request A
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired' }, { status: 401 })); // request B
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'new-token', refreshToken: 'new-refresh' })); // refresh
    fetchMock.mockResolvedValueOnce(jsonResponse({ a: true })); // retry A
    fetchMock.mockResolvedValueOnce(jsonResponse({ b: true })); // retry B

    const onTokens = vi.fn();
    const client = createApiClient({
      baseUrl: '',
      getToken: () => 'stale-token',
      fetch: fetchMock,
      validateResponses: true,
      refresh: {
        getRefreshToken: () => 'stale-refresh',
        onTokens,
      },
    });

    const [a, b] = await Promise.all([client.get('/a'), client.get('/b')]);
    expect(a).toEqual({ a: true });
    expect(b).toEqual({ b: true });

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    expect(onTokens).toHaveBeenCalledTimes(1);
  });

  it('calls onRefreshFailed (not onUnauthorized) exactly once when the refresh call itself 401s', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired' }, { status: 401 })); // original request
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid refresh token' }, { status: 401 })); // refresh call

    const onUnauthorized = vi.fn();
    const onRefreshFailed = vi.fn();
    const client = createApiClient({
      baseUrl: '',
      getToken: () => 'stale-token',
      onUnauthorized,
      fetch: fetchMock,
      validateResponses: true,
      refresh: {
        getRefreshToken: () => 'dead-refresh',
        onTokens: vi.fn(),
        onRefreshFailed,
      },
    });

    await expect(client.get('/protected')).rejects.toMatchObject({ status: 401 });
    expect(onRefreshFailed).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + refresh — no retry attempted
  });

  it('falls back to onUnauthorized when refresh fails and no onRefreshFailed is given', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired' }, { status: 401 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid refresh token' }, { status: 401 }));

    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: '',
      getToken: () => 'stale-token',
      onUnauthorized,
      fetch: fetchMock,
      validateResponses: true,
      refresh: {
        getRefreshToken: () => 'dead-refresh',
        onTokens: vi.fn(),
      },
    });

    await expect(client.get('/protected')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('skips refresh entirely (goes straight to onUnauthorized) when there is no refresh token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'expired' }, { status: 401 }));
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: '',
      getToken: () => 'stale-token',
      onUnauthorized,
      fetch: fetchMock,
      validateResponses: true,
      refresh: {
        getRefreshToken: () => null,
        onTokens: vi.fn(),
      },
    });

    await expect(client.get('/protected')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no refresh POST at all
  });
});

describe('ApiError / isApiError', () => {
  it('isApiError recognizes an ApiError instance', () => {
    expect(isApiError(new ApiError(404, 'not found', 'NOT_FOUND'))).toBe(true);
  });

  it('isApiError rejects a plain Error without a numeric status', () => {
    expect(isApiError(new Error('boom'))).toBe(false);
  });
});
