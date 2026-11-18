import {Alert} from 'react-native';
import {handleStravaLinkResult} from './stravaLinkResult';
import {queryClient} from '../data/queryClient';

jest.mock('../i18n/i18n', () => ({__esModule: true, default: {t: (key: string) => key}}));
jest.mock('../data/queryClient', () => ({queryClient: {invalidateQueries: jest.fn()}}));

const invalidate = queryClient.invalidateQueries as jest.Mock;

describe('handleStravaLinkResult', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('reloads the profile, rides and bikes once Strava is connected — and says nothing', () => {
    handleStravaLinkResult({ok: true});

    expect(invalidate.mock.calls.map(([arg]) => arg.queryKey[0])).toEqual(['profile', 'activities', 'bikes']);
    expect(alert).not.toHaveBeenCalled();
  });

  it('explains an athlete that belongs to another account', () => {
    handleStravaLinkResult({ok: false, reason: 'another_account'});

    expect(alert).toHaveBeenCalledWith('strava.anotherAccountTitle', 'strava.anotherAccountMessage');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('falls back to a plain failure message', () => {
    handleStravaLinkResult({ok: false});
    expect(alert).toHaveBeenCalledWith('common.error', 'strava.linkFailed');
  });
});
