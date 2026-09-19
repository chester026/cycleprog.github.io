import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { buildPath, callEndpoint, defineEndpoint, endpointKey, listEndpoints } from './define.js';
import type { ApiClient } from '../client.js';

const detail = defineEndpoint({
  method: 'GET',
  path: '/api/things/:id',
  params: z.object({ id: z.coerce.number().int() }),
  query: z.object({ period: z.enum(['4w', '1y']).optional(), tags: z.array(z.string()).optional() }).optional(),
  response: z.object({ id: z.number() }),
});

const create = defineEndpoint({
  method: 'POST',
  path: '/api/things',
  body: z.object({ title: z.string().min(1) }),
  response: z.object({ id: z.number() }),
});

function fakeClient(): ApiClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const rec = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); return Promise.resolve({ id: 1 }); };
  return {
    calls,
    request: rec('request') as ApiClient['request'],
    get: rec('get') as ApiClient['get'],
    post: rec('post') as ApiClient['post'],
    put: rec('put') as ApiClient['put'],
    patch: rec('patch') as ApiClient['patch'],
    del: rec('del') as ApiClient['del'],
    upload: rec('upload') as ApiClient['upload'],
  };
}

describe('buildPath', () => {
  it('substitutes params and appends an encoded query, dropping undefined and repeating arrays', () => {
    expect(buildPath('/api/things/:id', { id: 7 }, { period: '4w', skip: undefined, tags: ['a b', 'c'] }))
      .toBe('/api/things/7?period=4w&tags=a%20b&tags=c');
  });
  it('throws on a missing param', () => {
    expect(() => buildPath('/api/things/:id', {})).toThrow(/Missing route param ":id"/);
  });
});

describe('callEndpoint', () => {
  it('validates input, builds the path and passes the response schema to the client', async () => {
    const client = fakeClient();
    await callEndpoint(client, detail, { params: { id: '5' as unknown as number }, query: { period: '1y' } });
    expect(client.calls[0][0]).toBe('get');
    expect(client.calls[0][1]).toBe('/api/things/5?period=1y');
    expect((client.calls[0][2] as { schema: unknown }).schema).toBe(detail.response);
  });
  it('rejects an invalid body before any request is made', async () => {
    const client = fakeClient();
    await expect(callEndpoint(client, create, { body: { title: '' } })).rejects.toBeInstanceOf(z.ZodError);
    expect(client.calls).toHaveLength(0);
  });
  it('POSTs the parsed body', async () => {
    const client = fakeClient();
    await callEndpoint(client, create, { body: { title: 'x' } });
    expect(client.calls[0].slice(0, 3)).toEqual(['post', '/api/things', { title: 'x' }]);
  });
});

describe('omitted query/body', () => {
  it('treats an omitted query as {} when the schema is an all-optional object (no request would leave otherwise)', async () => {
    const list = defineEndpoint({
      method: 'GET',
      path: '/api/things',
      query: z.object({ limit: z.coerce.number().optional() }).passthrough(),
      response: z.array(z.object({ id: z.number() })),
    });
    const client = fakeClient();
    await callEndpoint(client, list);
    expect(client.calls[0][1]).toBe('/api/things');
  });
  it('still rejects an omitted body when the schema has required fields', async () => {
    const client = fakeClient();
    await expect(callEndpoint(client, create)).rejects.toBeInstanceOf(z.ZodError);
    expect(client.calls).toHaveLength(0);
  });
  it('sends {} for an omitted all-optional body', async () => {
    const sync = defineEndpoint({
      method: 'POST',
      path: '/api/oura/sync',
      body: z.object({ force: z.boolean().optional() }),
      response: z.object({ ok: z.boolean() }),
    });
    const client = fakeClient();
    await callEndpoint(client, sync);
    expect(client.calls[0].slice(0, 3)).toEqual(['post', '/api/oura/sync', {}]);
  });
});

describe('multipart', () => {
  it('passes FormData through untouched to client.upload without parsing it against the body schema', async () => {
    const upload = defineEndpoint({
      method: 'POST',
      path: '/api/hero/upload',
      body: z.object({ pos: z.string() }),
      response: z.object({ id: z.number() }),
      multipart: true,
    });
    const client = fakeClient();
    const fd = new FormData();
    fd.append('pos', 'left');
    await callEndpoint(client, upload, { body: fd as unknown as { pos: string } });
    expect(client.calls[0][0]).toBe('upload');
    expect(client.calls[0][2]).toBe(fd);
  });
});

describe('registry helpers', () => {
  it('lists and keys endpoints', () => {
    const list = listEndpoints({ things: { detail, create } });
    expect(list.map((e) => endpointKey(e.def))).toEqual(['GET /api/things/:id', 'POST /api/things']);
    expect(vi.isMockFunction(buildPath)).toBe(false);
  });
});
