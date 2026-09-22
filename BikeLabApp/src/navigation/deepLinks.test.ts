import {parseDeepLink} from './deepLinks';

describe('parseDeepLink', () => {
  it('splits a custom-scheme URL with no query into base + empty params', () => {
    expect(parseDeepLink('bikelab://oura')).toEqual({base: 'bikelab://oura', params: {}});
  });

  it('parses multiple query params off a custom scheme', () => {
    expect(parseDeepLink('bikelab://strava-linked?ok=1&error=denied')).toEqual({
      base: 'bikelab://strava-linked',
      params: {ok: '1', error: 'denied'},
    });
  });

  it('decodes percent-encoded param values', () => {
    expect(parseDeepLink('bikelab://auth?code=abc%2F123')).toEqual({
      base: 'bikelab://auth',
      params: {code: 'abc/123'},
    });
  });

  it('parses a Universal Link (https://) the same way', () => {
    expect(parseDeepLink('https://bikelab.app/auth?code=xyz')).toEqual({
      base: 'https://bikelab.app/auth',
      params: {code: 'xyz'},
    });
  });

  it('handles a bare flag param with no "="', () => {
    expect(parseDeepLink('bikelab://x?flag&code=1')).toEqual({
      base: 'bikelab://x',
      params: {flag: '', code: '1'},
    });
  });

  it('never throws on a malformed % escape — keeps the raw text instead', () => {
    expect(() => parseDeepLink('bikelab://x?code=%')).not.toThrow();
    expect(parseDeepLink('bikelab://x?code=%')).toEqual({base: 'bikelab://x', params: {code: '%'}});
  });
});

// handleAuthDeepLink pulls in api.call/TokenStorage/emitStravaLinked, all of
// which touch native modules (AsyncStorage, DeviceEventEmitter) or the
// keychain-backed client — mocked here so this stays a fast unit test of the
// branching/dedup logic itself, not an integration test of the network
// layer. `../data/api`'s domain maps (`auth`, `userProfile`) come from
// `@bikelab/shared/api` directly rather than `jest.requireActual('../data/api')`
// — see useProfile.test.tsx for why.
jest.mock('../utils/api', () => ({
  TokenStorage: {setToken: jest.fn()},
}));
jest.mock('../data/api', () => ({
  ...jest.requireActual('@bikelab/shared/api'),
  api: {call: jest.fn()},
}));
jest.mock('../auth/strava', () => ({emitStravaLinked: jest.fn()}));

import {TokenStorage} from '../utils/api';
import {api} from '../data/api';
import {emitStravaLinked} from '../auth/strava';
import {handleAuthDeepLink} from './deepLinks';

const mockApiCall = api.call as jest.Mock;
const mockSetToken = TokenStorage.setToken as jest.Mock;
const mockEmitStravaLinked = emitStravaLinked as jest.Mock;

describe('handleAuthDeepLink', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
    mockSetToken.mockReset();
    mockEmitStravaLinked.mockReset();
  });

  it('bails out on bikelab://oura without touching the token/API', async () => {
    const result = await handleAuthDeepLink(`bikelab://oura?x=${Math.random()}`);
    expect(result).toEqual({type: 'oura'});
    expect(mockApiCall).not.toHaveBeenCalled();
  });

  it('emits STRAVA_LINKED_EVENT for bikelab://strava-linked and never exchanges a code', async () => {
    const url = `bikelab://strava-linked?ok=1&r=${Math.random()}`;
    const result = await handleAuthDeepLink(url);
    expect(result).toEqual({type: 'strava-linked', ok: true, error: undefined});
    expect(mockEmitStravaLinked).toHaveBeenCalledWith({ok: true, error: undefined});
    expect(mockApiCall).not.toHaveBeenCalled();
  });

  it('passes the strava-linked error through when ok=0', async () => {
    const url = `bikelab://strava-linked?ok=0&error=denied&r=${Math.random()}`;
    const result = await handleAuthDeepLink(url);
    expect(result).toEqual({type: 'strava-linked', ok: false, error: 'denied'});
  });

  it('exchanges the auth code, stores the token, and resolves the post-auth route', async () => {
    mockApiCall
      .mockResolvedValueOnce({token: 'jwt-123'}) // POST /api/auth/exchange
      .mockResolvedValueOnce({onboarding_completed: false}); // GET /api/user-profile

    const url = `bikelab://auth?code=abc&r=${Math.random()}`;
    const result = await handleAuthDeepLink(url);

    expect(mockApiCall.mock.calls[0][0]).toMatchObject({method: 'POST', path: '/api/auth/exchange'});
    expect(mockApiCall.mock.calls[0][1]).toEqual({body: {code: 'abc'}});
    expect(mockSetToken).toHaveBeenCalledWith('jwt-123', true);
    expect(result).toEqual({type: 'auth-success', route: 'Onboarding'});
  });

  it('falls back to Main when the profile fetch fails after a successful exchange', async () => {
    mockApiCall.mockResolvedValueOnce({token: 'jwt-456'}).mockRejectedValueOnce(new Error('network'));

    const url = `bikelab://auth?code=def&r=${Math.random()}`;
    const result = await handleAuthDeepLink(url);

    expect(result).toEqual({type: 'auth-success', route: 'Main'});
  });

  it('reports auth-error when the URL has no code', async () => {
    const url = `bikelab://auth?r=${Math.random()}`;
    const result = await handleAuthDeepLink(url);
    expect(result).toEqual({type: 'auth-error', reason: 'missing-code'});
    expect(mockApiCall).not.toHaveBeenCalled();
  });

  it('reports auth-error when the exchange call itself throws', async () => {
    mockApiCall.mockRejectedValueOnce(new Error('boom'));
    const url = `bikelab://auth?code=abc&r=${Math.random()}`;
    const result = await handleAuthDeepLink(url);
    expect(result).toEqual({type: 'auth-error', reason: 'exchange-failed'});
  });

  it('ignores an unrelated URL scheme', async () => {
    const result = await handleAuthDeepLink('https://example.com/whatever');
    expect(result).toEqual({type: 'ignored'});
  });

  it('only handles the exact same URL once — a duplicate delivery is a no-op', async () => {
    mockApiCall.mockResolvedValueOnce({token: 'jwt-789'}).mockResolvedValueOnce({onboarding_completed: true});
    const url = `bikelab://auth?code=xyz&r=${Math.random()}`;

    const first = await handleAuthDeepLink(url);
    expect(first).toEqual({type: 'auth-success', route: 'Main'});
    expect(mockApiCall).toHaveBeenCalledTimes(2);

    const second = await handleAuthDeepLink(url);
    expect(second).toEqual({type: 'duplicate'});
    // No extra api.call calls — the one-time code isn't exchanged again.
    expect(mockApiCall).toHaveBeenCalledTimes(2);
  });
});

describe('parseDeepLink fragments and whitespace', () => {
  it('drops a trailing #fragment and whitespace so the auth code is exactly what the server minted', () => {
    const code = 'a'.repeat(64);
    expect(parseDeepLink(`bikelab://auth?code=${code}#`).params.code).toBe(code);
    expect(parseDeepLink(`bikelab://auth?code=${code}#_=_`).params.code).toBe(code);
    expect(parseDeepLink(`bikelab://auth?code=${code}\n`).params.code).toBe(code);
  });
});
