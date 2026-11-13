// @react-native-documents/picker is a native module (no implementation in the
// Jest environment) and ships untranspiled ESM. Tests that reach it through
// src/utils/pickRouteFile.ts get a picker that "cancels"; a test that wants a
// file mocks `pick` itself.
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(async () => {
    const error = new Error('cancelled');
    error.code = 'OPERATION_CANCELED';
    throw error;
  }),
  types: {allFiles: 'public.item'},
  errorCodes: {OPERATION_CANCELED: 'OPERATION_CANCELED'},
  isErrorWithCode: error => !!error && typeof error.code === 'string',
}));
