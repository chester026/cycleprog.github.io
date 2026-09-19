import React from 'react';
import {render, screen, fireEvent, waitFor} from '@testing-library/react-native';
import {AccountSettingsScreen} from '../AccountSettingsScreen';
import {useProfile} from '../../data/hooks/useProfile';
import {useUpdateProfile} from '../../data/hooks/useUpdateProfile';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('../../data/hooks/useProfile', () => ({useProfile: jest.fn()}));
jest.mock('../../data/hooks/useUpdateProfile', () => ({useUpdateProfile: jest.fn()}));

const mockedUseProfile = useProfile as jest.Mock;
const mockedUseUpdateProfile = useUpdateProfile as jest.Mock;

const navigation = {goBack: jest.fn()} as any;

describe('AccountSettingsScreen', () => {
  beforeEach(() => {
    mockedUseProfile.mockReset();
    mockedUseUpdateProfile.mockReset();
    navigation.goBack.mockReset();
  });

  it('shows a loading spinner while useProfile() is loading, not a form', () => {
    mockedUseProfile.mockReturnValue({isLoading: true, isError: false, data: undefined});
    mockedUseUpdateProfile.mockReturnValue({mutateAsync: jest.fn(), isPending: false});

    render(<AccountSettingsScreen navigation={navigation} />);

    expect(screen.queryByText('settings.emailAddress')).toBeNull();
  });

  it('renders the loaded email and saves an edited value through useUpdateProfile()', async () => {
    mockedUseProfile.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {email: 'rider@example.com'},
    });
    const mutateAsync = jest.fn().mockResolvedValue({});
    mockedUseUpdateProfile.mockReturnValue({mutateAsync, isPending: false});

    render(<AccountSettingsScreen navigation={navigation} />);

    const input = screen.getByPlaceholderText('settings.emailPlaceholder');
    expect(input.props.value).toBe('rider@example.com');

    fireEvent.changeText(input, 'new@example.com');
    fireEvent.press(screen.getByText('common.save'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({email: 'new@example.com'}));
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
