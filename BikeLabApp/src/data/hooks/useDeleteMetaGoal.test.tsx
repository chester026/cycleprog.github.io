import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useDeleteMetaGoal} from './useDeleteMetaGoal';
import {api} from '../api';

// Mocks the typed contract entry point (T-7.1) — every hook now calls
// `api.call(def, input)` instead of `apiFetch(url)`. The domain maps
// (`userProfile`, `activities`, ...) come straight from `@bikelab/shared/api`
// (no native deps) rather than `jest.requireActual('../api')`, which would
// also re-run `../api`'s own `import {apiClient} from '../utils/api'` and
// pull in the keychain-backed client / react-native-config — neither
// transpiles under this preset and neither is needed for these tests.
jest.mock('../api', () => ({
  ...jest.requireActual('@bikelab/shared/api'),
  api: {call: jest.fn()},
}));
// `queryClient.ts` imports `auth/session.ts` (for its own reasons), which
// imports the real `utils/api.ts` for `TokenStorage` — and THAT pulls in
// `config.ts`/`react-native-config`, which doesn't transpile under this
// preset (see the comment above). Mocked minimally, just enough that the
// module graph resolves; nothing in these tests calls into it.
jest.mock('../../utils/api', () => ({
  TokenStorage: {getRefreshToken: jest.fn(), removeToken: jest.fn(), setTokens: jest.fn()},
}));

const mockedApiCall = api.call as jest.Mock;

describe('useDeleteMetaGoal', () => {
  const clients: QueryClient[] = [];

  function makeWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: {queries: {retry: false}, mutations: {retry: false}},
    });
    clients.push(queryClient);
    const Wrapper: React.FC<{children: React.ReactNode}> = ({children}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return Wrapper;
  }

  beforeEach(() => {
    mockedApiCall.mockReset();
  });

  afterEach(() => {
    clients.forEach(c => c.clear());
    clients.length = 0;
  });

  it('DELETEs /api/meta-goals/:id', async () => {
    mockedApiCall.mockResolvedValueOnce({success: true});

    const {result} = renderHook(() => useDeleteMetaGoal(), {wrapper: makeWrapper()});

    result.current.mutate(42);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedApiCall.mock.calls[0][0]).toMatchObject({method: 'DELETE', path: '/api/meta-goals/:id'});
    expect(mockedApiCall.mock.calls[0][1]).toEqual({params: {id: 42}});
  });
});
