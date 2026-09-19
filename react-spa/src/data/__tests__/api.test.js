import { describe, it, expect, vi, beforeEach } from 'vitest';

// T-7.1: `src/data/api.js` is the single import point for the API
// contract — `call` (src/utils/api.js's typed wrapper around
// `@bikelab/shared/api`'s `callEndpoint`) plus every domain endpoint map.
// These tests mock the shared package's `createApiClient`/`callEndpoint` so
// `call()`'s own forwarding/error-logging logic is exercised without a real
// network client (that plumbing is `@bikelab/shared/api`'s own test suite's
// job — see packages/shared/src/api/contract/define.test.ts).
const callEndpointMock = vi.fn();
vi.mock('@bikelab/shared/api', async () => {
  const actual = await vi.importActual('@bikelab/shared/api');
  return {
    ...actual,
    createApiClient: () => ({ request: vi.fn() }),
    callEndpoint: (...args) => callEndpointMock(...args),
  };
});

describe('src/data/api.js', () => {
  beforeEach(() => {
    callEndpointMock.mockReset();
  });

  it('re-exports call() and every domain map from a single module', async () => {
    const mod = await import('../api');
    expect(typeof mod.call).toBe('function');
    for (const domain of [
      'auth',
      'account',
      'userProfile',
      'admin',
      'oura',
      'media',
      'activities',
      'analytics',
      'skills',
      'achievements',
      'rides',
      'calendar',
      'events',
      'weather',
      'goals',
      'metaGoals',
      'training',
      'bikes',
      'checklist',
      'coach',
    ]) {
      expect(mod[domain]).toBeTypeOf('object');
    }
    // goals.list is a real EndpointDef — GET /api/goals, no string path
    // built by hand at the call site.
    expect(mod.goals.list).toMatchObject({ method: 'GET', path: '/api/goals' });
  });

  it('call(def, input) forwards to callEndpoint with the shared client and resolves its result', async () => {
    callEndpointMock.mockResolvedValueOnce({ ok: true });
    const { call, goals } = await import('../api');

    const result = await call(goals.list);

    expect(result).toEqual({ ok: true });
    expect(callEndpointMock).toHaveBeenCalledWith(expect.anything(), goals.list, undefined, {});
  });

  it('call() passes params/query/body straight through as the endpoint input', async () => {
    callEndpointMock.mockResolvedValueOnce({ id: 1 });
    const { call, goals } = await import('../api');

    await call(goals.update, { params: { id: 1 }, body: { title: 'x' } });

    expect(callEndpointMock).toHaveBeenCalledWith(
      expect.anything(),
      goals.update,
      { params: { id: 1 }, body: { title: 'x' } },
      {},
    );
  });

  it('call() rejects with the underlying error when callEndpoint rejects (e.g. a client-side zod validation failure)', async () => {
    const err = new Error('bad input');
    callEndpointMock.mockRejectedValueOnce(err);
    const { call, goals } = await import('../api');

    await expect(call(goals.update, { params: { id: 'nope' }, body: {} })).rejects.toBe(err);
  });
});
