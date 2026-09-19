import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useStravaStatus} from './useStravaStatus';
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

describe('useStravaStatus', () => {
  const clients: QueryClient[] = [];

  function makeWrapper() {
    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
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

  it('derives connected: false with no strava_id on the profile', async () => {
    mockedApiCall.mockResolvedValueOnce({id: 1, name: 'Rider'});

    const {result} = renderHook(() => useStravaStatus(), {wrapper: makeWrapper()});

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toEqual({
      connected: false,
      athleteName: 'Rider',
      stravaId: null,
    });
  });

  it('derives connected: true once the profile has a strava_id', async () => {
    mockedApiCall.mockResolvedValueOnce({id: 1, name: 'Rider', strava_id: 555});

    const {result} = renderHook(() => useStravaStatus(), {wrapper: makeWrapper()});

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toEqual({
      connected: true,
      athleteName: 'Rider',
      stravaId: 555,
    });
  });
});
