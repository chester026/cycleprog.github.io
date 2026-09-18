// T-5.1: src/data/queryClient.ts imports @react-native-async-storage/
// async-storage for the query persister. There's no native module in the
// Jest environment, so any test that transitively imports it needs this
// mock registered — the package's own jest/async-storage-mock.js just
// exports the mock object, it doesn't call jest.mock() itself.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
