module.exports = {
  preset: 'react-native',
  // T-5.1: any test that renders a hook inside a TanStack Query
  // `QueryClientProvider` (most src/data/hooks/* tests) leaves the process
  // unable to exit on its own afterwards — React 19's concurrent scheduler
  // + this RN/jest-environment-node combo, independent of anything in this
  // app's own code (repros with a bare `useQuery` and no app code
  // involved). The tests themselves pass and finish in well under a
  // second; only the process teardown hangs, so force it.
  forceExit: true,
  // Explicitly listing `setupFiles` REPLACES (doesn't merge with) the
  // react-native preset's own — so its setup.js has to be re-listed here
  // too, alongside the AsyncStorage mock this adds (T-5.1:
  // src/data/queryClient.ts imports AsyncStorage for the query persister —
  // without this mock, any test that transitively imports it fails with
  // "NativeModule: AsyncStorage is null", since there's no native module in
  // the Jest environment).
  setupFiles: [
    require.resolve('react-native/jest/setup.js'),
    '<rootDir>/jest/setupAsyncStorageMock.js',
  ],
  // A-29 / T-5.5: BlobOrb.test.tsx renders react-native-linear-gradient +
  // react-native-reanimated, which ship ESM and need Babel transform (the
  // preset's default pattern only whitelists react-native/@react-native-*).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-linear-gradient|react-native-reanimated|react-native-worklets)/)',
  ],
};
