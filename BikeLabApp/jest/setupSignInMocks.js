// Sign in with Apple / Google are native modules — absent in the Jest
// environment, so importing either library would throw at module load.
// Tests that exercise src/auth/identity.ts override these per case.
jest.mock('@invertase/react-native-apple-authentication', () => {
  return {
    appleAuth: {
      isSupported: true,
      Operation: {LOGIN: 1},
      Scope: {EMAIL: 0, FULL_NAME: 1},
      Error: {CANCELED: '1001'},
      performRequest: jest.fn(),
    },
  };
});

jest.mock('@react-native-google-signin/google-signin', () => {
  return {
    GoogleSignin: {configure: jest.fn(), signIn: jest.fn()},
    statusCodes: {SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED'},
    isErrorWithCode: error => typeof error === 'object' && error !== null && 'code' in error,
    isSuccessResponse: response => response?.type === 'success',
  };
});
