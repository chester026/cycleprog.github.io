import React from 'react';
import {Platform} from 'react-native';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {ProfileScreen} from '../ProfileScreen';
import {useProfile} from '../../data/hooks/useProfile';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {language: 'en'},
  }),
}));
jest.mock('../../data/hooks/useProfile', () => ({useProfile: jest.fn()}));
jest.mock('../../i18n/i18n', () => ({changeLanguage: jest.fn()}));
jest.mock('../../auth/session', () => ({signOut: jest.fn()}));
// `api.call` is never actually exercised in these tests (the delete-account
// flow needs a confirmation Alert none of them trigger) — mocked purely so
// `ProfileScreen.tsx`'s `import {api, account} from '../data/api'` doesn't
// pull in the keychain-backed client / react-native-config (see
// useProfile.test.tsx for why).
jest.mock('../../data/api', () => ({
  ...jest.requireActual('@bikelab/shared/api'),
  api: {call: jest.fn()},
}));
jest.mock('react-native-svg', () => {
  const {View} = require('react-native');
  return {SvgXml: View};
});

const mockedUseProfile = useProfile as jest.Mock;
const navigation = {navigate: jest.fn()} as any;

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockedUseProfile.mockReset();
    navigation.navigate.mockReset();
    mockedUseProfile.mockReturnValue({
      isLoading: false,
      data: {name: 'Alex Rider', experience_level: 'advanced'},
    });
  });

  it('shows the rider name loaded from useProfile()', () => {
    render(<ProfileScreen navigation={navigation} />);
    expect(screen.getByText('Alex Rider')).toBeTruthy();
  });

  it('navigates to PersonalInfo when that row is pressed', () => {
    render(<ProfileScreen navigation={navigation} />);
    fireEvent.press(screen.getByText('profile.personalInfo'));
    expect(navigation.navigate).toHaveBeenCalledWith('PersonalInfo');
  });

  // A-40: Apple Health is iOS-only (no HealthKit on Android) — the settings
  // row should disappear entirely rather than link to a dead-end screen.
  it('hides the Apple Health integration row on Android', () => {
    const originalOS = Platform.OS;
    Platform.OS = 'android';

    render(<ProfileScreen navigation={navigation} />);
    expect(screen.queryByText('profile.appleHealthIntegration')).toBeNull();

    Platform.OS = originalOS;
  });

  it('shows the Apple Health integration row on iOS', () => {
    const originalOS = Platform.OS;
    Platform.OS = 'ios';

    render(<ProfileScreen navigation={navigation} />);
    expect(screen.getByText('profile.appleHealthIntegration')).toBeTruthy();

    Platform.OS = originalOS;
  });
});
