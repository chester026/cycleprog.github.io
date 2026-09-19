// Unit test for `src/data/api.ts` (T-7.1 client half) — `api.call` is a
// thin wrapper over `@bikelab/shared/api`'s `callEndpoint(apiClient, def,
// input, opts)`; this exercises that wiring end to end (path building,
// method routing, response passthrough) against a stubbed `apiClient`
// rather than a real network call. `../utils/api` is mocked so this stays a
// fast unit test — the real module pulls in the keychain-backed client and
// react-native-config (see src/data/hooks/useProfile.test.tsx for the same
// reasoning).
// Babel hoists both `jest.mock` calls and this file's `import` statements
// above ordinary top-level `const`s, so the stub client is built INSIDE the
// factory (not referenced from an outer variable) and re-read via
// `jest.requireMock` below, rather than assigned to a `const` this file
// would otherwise see as still-undefined when `./api` (and transitively
// `../utils/api`) is first required.
jest.mock('../utils/api', () => ({
  apiClient: {
    request: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    del: jest.fn(),
    upload: jest.fn(),
  },
}));

import {api, userProfile, goals} from './api';

const mockApiClient = jest.requireMock('../utils/api').apiClient as Record<string, jest.Mock>;

describe('data/api.ts', () => {
  beforeEach(() => {
    Object.values(mockApiClient).forEach(fn => fn.mockReset());
  });

  it('routes a GET endpoint with no params through apiClient.get', async () => {
    mockApiClient.get.mockResolvedValueOnce({id: 1, onboarding_completed: true});

    const result = await api.call(userProfile.get);

    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    expect(mockApiClient.get.mock.calls[0][0]).toBe('/api/user-profile');
    expect(result).toEqual({id: 1, onboarding_completed: true});
  });

  it('substitutes route params and sends the body for a PUT', async () => {
    mockApiClient.put.mockResolvedValueOnce({id: 7, target_value: 500});

    await api.call(goals.update, {params: {id: 7}, body: {target_value: 500}});

    expect(mockApiClient.put).toHaveBeenCalledTimes(1);
    expect(mockApiClient.put.mock.calls[0][0]).toBe('/api/goals/7');
    expect(mockApiClient.put.mock.calls[0][1]).toEqual({target_value: 500});
  });

  it('rejects a request that fails the endpoint\'s own zod validation before it ever reaches apiClient', async () => {
    // `goals.update`'s params coerce `id` to a number — a value that can't
    // coerce (e.g. an empty object) should never leave the device as a
    // request.
    await expect(
      api.call(goals.update, {params: {id: 'not-a-number' as any}, body: {}}),
    ).rejects.toBeTruthy();
    expect(mockApiClient.put).not.toHaveBeenCalled();
  });

  it('routes a DELETE endpoint with only route params', async () => {
    mockApiClient.del.mockResolvedValueOnce({success: true});

    const result = await api.call(goals.remove, {params: {id: 42}});

    expect(mockApiClient.del).toHaveBeenCalledTimes(1);
    expect(mockApiClient.del.mock.calls[0][0]).toBe('/api/goals/42');
    expect(result).toEqual({success: true});
  });
});
