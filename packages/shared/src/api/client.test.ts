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

describe('ApiError / isApiError', () => {
  it('isApiError recognizes an ApiError instance', () => {
    expect(isApiError(new ApiError(404, 'not found', 'NOT_FOUND'))).toBe(true);
  });

  it('isApiError rejects a plain Error without a numeric status', () => {
    expect(isApiError(new Error('boom'))).toBe(false);
  });
});
