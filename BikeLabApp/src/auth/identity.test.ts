import {appleAuth} from '@invertase/react-native-apple-authentication';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {api, identity} from '../data/api';
import {signInWithApple, signInWithGoogle} from './identity';

jest.mock('../config', () => ({GOOGLE_IOS_CLIENT_ID: 'ios-client.apps.googleusercontent.com'}));

jest.mock('../data/api', () => ({
  api: {call: jest.fn()},
  identity: {nonce: {name: 'nonce'}, apple: {name: 'apple'}, google: {name: 'google'}},
}));

const call = api.call as jest.Mock;
const performRequest = appleAuth.performRequest as jest.Mock;
const googleSignIn = GoogleSignin.signIn as jest.Mock;

const session = {token: 'jwt', refreshToken: 'refresh', isNewUser: true, user: {id: 1}};

describe('signInWithApple', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    call.mockImplementation(async def => (def === identity.nonce ? {nonce: 'server-nonce'} : session));
  });

  it('binds the server nonce into the request and posts the token, code and name', async () => {
    performRequest.mockResolvedValue({
      identityToken: 'apple-token',
      authorizationCode: 'apple-code',
      fullName: {givenName: 'Ada', familyName: 'Lovelace', nickname: null},
    });

    const result = await signInWithApple();

    expect(performRequest).toHaveBeenCalledWith(expect.objectContaining({nonce: 'server-nonce'}));
    expect(call).toHaveBeenLastCalledWith(identity.apple, {
      body: {
        identityToken: 'apple-token',
        nonce: 'server-nonce',
        authorizationCode: 'apple-code',
        fullName: {givenName: 'Ada', familyName: 'Lovelace'},
      },
    });
    expect(result).toEqual({type: 'signed-in', session});
  });

  it('reports a closed sheet as cancelled, without calling the server', async () => {
    performRequest.mockRejectedValue({code: appleAuth.Error.CANCELED});

    expect(await signInWithApple()).toEqual({type: 'cancelled'});
    expect(call).toHaveBeenCalledTimes(1); // the nonce only
  });

  it('throws when Apple fails or returns no token', async () => {
    performRequest.mockRejectedValue({code: '1000'});
    await expect(signInWithApple()).rejects.toEqual({code: '1000'});

    performRequest.mockResolvedValue({identityToken: null});
    await expect(signInWithApple()).rejects.toThrow('no identity token');
  });
});

describe('signInWithGoogle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    call.mockResolvedValue(session);
  });

  it('posts the ID token Google returned', async () => {
    googleSignIn.mockResolvedValue({type: 'success', data: {idToken: 'google-token'}});

    const result = await signInWithGoogle();

    expect(GoogleSignin.configure).toHaveBeenCalledWith({iosClientId: 'ios-client.apps.googleusercontent.com'});
    expect(call).toHaveBeenCalledWith(identity.google, {body: {idToken: 'google-token'}});
    expect(result).toEqual({type: 'signed-in', session});
  });

  it('reports a dismissed sheet as cancelled, either way the SDK signals it', async () => {
    googleSignIn.mockResolvedValue({type: 'cancelled', data: null});
    expect(await signInWithGoogle()).toEqual({type: 'cancelled'});

    googleSignIn.mockRejectedValue({code: 'SIGN_IN_CANCELLED'});
    expect(await signInWithGoogle()).toEqual({type: 'cancelled'});

    expect(call).not.toHaveBeenCalled();
  });

  it('throws when Google returns no ID token', async () => {
    googleSignIn.mockResolvedValue({type: 'success', data: {idToken: null}});
    await expect(signInWithGoogle()).rejects.toThrow('no ID token');
  });
});
