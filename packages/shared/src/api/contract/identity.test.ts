import { describe, it, expect } from 'vitest';
import { identity } from './identity.js';

const session = {
  token: 'jwt',
  refreshToken: 'refresh',
  isNewUser: true,
  user: { id: 7, name: 'Ada', avatar: null, email: 'ada@example.com' },
};

describe('identity contract', () => {
  it('apple: needs the token and the nonce; code and name are optional', () => {
    expect(identity.apple.body!.safeParse({ identityToken: 't', nonce: 'n' }).success).toBe(true);
    expect(
      identity.apple.body!.safeParse({
        identityToken: 't',
        nonce: 'n',
        authorizationCode: 'c',
        fullName: { givenName: 'Ada', familyName: null },
      }).success
    ).toBe(true);
    expect(identity.apple.body!.safeParse({ identityToken: 't' }).success).toBe(false);
  });

  it('google: the nonce is optional', () => {
    expect(identity.google.body!.safeParse({ idToken: 't' }).success).toBe(true);
    expect(identity.google.body!.safeParse({ idToken: '' }).success).toBe(false);
  });

  it('sign-in responses carry the session envelope plus isNewUser', () => {
    expect(identity.apple.response.safeParse(session).success).toBe(true);
    expect(identity.google.response.safeParse({ ...session, isNewUser: undefined }).success).toBe(false);
  });

  it('list: accepts a pg Date for created_at', () => {
    const payload = {
      methods: [{ provider: 'apple', email: null, created_at: new Date() }],
      has_password: false,
      needs_sign_in_method: false,
    };
    expect(identity.list.response.safeParse(payload).success).toBe(true);
  });

  it('unlink: only known providers', () => {
    expect(identity.unlink.params!.safeParse({ provider: 'google' }).success).toBe(true);
    expect(identity.unlink.params!.safeParse({ provider: 'strava' }).success).toBe(false);
  });
});
