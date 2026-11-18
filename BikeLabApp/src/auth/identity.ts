// Sign in with Apple / Google (docs/plans/auth-providers.md §4.1). Each
// provider's SDK hands the app a signed ID token; the server verifies it and
// answers with the same session pair every other login path returns. No
// browser round-trip and no deep link — unlike ./strava.ts.
import {appleAuth} from '@invertase/react-native-apple-authentication';
import {GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes} from '@react-native-google-signin/google-signin';
import {api, identity, type EndpointResponse} from '../data/api';
import {GOOGLE_IOS_CLIENT_ID} from '../config';

export type IdentitySession = EndpointResponse<typeof identity.apple>;

/** `cancelled` — the rider closed the provider's sheet; not an error, nothing to show. */
export type IdentitySignInResult = {type: 'signed-in'; session: IdentitySession} | {type: 'cancelled'};

const CANCELLED: IdentitySignInResult = {type: 'cancelled'};

/** Sign in with Apple needs iOS 13+; the button is hidden where it is not supported. */
export const isAppleSignInSupported: boolean = appleAuth.isSupported;

function isAppleCancellation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === appleAuth.Error.CANCELED;
}

export async function signInWithApple(): Promise<IdentitySignInResult> {
  // One-time, minted by the server and bound into the token: the SDK sends
  // Apple its SHA-256, the server checks the token against the value it issued.
  const {nonce} = await api.call(identity.nonce);

  let credential;
  try {
    credential = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
      nonce,
    });
  } catch (error) {
    if (isAppleCancellation(error)) return CANCELLED;
    throw error;
  }
  if (!credential.identityToken) throw new Error('Apple returned no identity token');

  const session = await api.call(identity.apple, {
    body: {
      identityToken: credential.identityToken,
      nonce,
      authorizationCode: credential.authorizationCode,
      // Apple gives the name on the first authorization only — the server
      // keeps it from this one call.
      fullName: credential.fullName
        ? {givenName: credential.fullName.givenName, familyName: credential.fullName.familyName}
        : null,
    },
  });
  return {type: 'signed-in', session};
}

let googleConfigured = false;

export async function signInWithGoogle(): Promise<IdentitySignInResult> {
  if (!googleConfigured) {
    GoogleSignin.configure({iosClientId: GOOGLE_IOS_CLIENT_ID});
    googleConfigured = true;
  }

  let response;
  try {
    response = await GoogleSignin.signIn();
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) return CANCELLED;
    throw error;
  }
  if (!isSuccessResponse(response)) return CANCELLED;
  if (!response.data.idToken) throw new Error('Google returned no ID token');

  const session = await api.call(identity.google, {body: {idToken: response.data.idToken}});
  return {type: 'signed-in', session};
}
