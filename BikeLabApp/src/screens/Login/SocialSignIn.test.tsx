import React from 'react';
import {Alert} from 'react-native';
import {render, screen, fireEvent, waitFor} from '@testing-library/react-native';
import {SocialSignIn} from './SocialSignIn';
import {useAuthProviders} from '../../data/hooks/useAuthProviders';
import {signInWithApple, signInWithGoogle} from '../../auth/identity';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

jest.mock('../../data/hooks/useAuthProviders', () => ({
  useAuthProviders: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({logger: {error: jest.fn(), debug: jest.fn()}}));

jest.mock('../../auth/identity', () => ({
  isAppleSignInSupported: true,
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
}));

const mockedProviders = useAuthProviders as jest.Mock;
const session = {token: 'jwt', refreshToken: 'refresh', isNewUser: false, user: {id: 1}};

describe('SocialSignIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedProviders.mockReturnValue({data: {apple: true, google: true}});
  });

  it('shows only the providers the server is configured for', () => {
    mockedProviders.mockReturnValue({data: {apple: true, google: false}});
    render(<SocialSignIn onSignedIn={jest.fn()} />);

    expect(screen.getByTestId('login-apple-button')).toBeTruthy();
    expect(screen.getByText('login.signInApple')).toBeTruthy();
    expect(screen.queryByTestId('login-google-button')).toBeNull();
  });

  it("shows Google's mark next to the Google label", () => {
    render(<SocialSignIn onSignedIn={jest.fn()} />);
    expect(screen.getByTestId('login-google-mark')).toBeTruthy();
    expect(screen.getByText('login.signInGoogle')).toBeTruthy();
  });

  it('renders nothing while no provider is known', () => {
    mockedProviders.mockReturnValue({data: undefined});
    render(<SocialSignIn onSignedIn={jest.fn()} />);
    expect(screen.queryByTestId('login-social')).toBeNull();
  });

  it('hands the session to the screen after a sign-in', async () => {
    (signInWithGoogle as jest.Mock).mockResolvedValue({type: 'signed-in', session});
    const onSignedIn = jest.fn();
    render(<SocialSignIn onSignedIn={onSignedIn} />);

    fireEvent.press(screen.getByTestId('login-google-button'));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(session));
  });

  it('stays quiet when the rider cancels', async () => {
    (signInWithApple as jest.Mock).mockResolvedValue({type: 'cancelled'});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSignedIn = jest.fn();
    render(<SocialSignIn onSignedIn={onSignedIn} />);

    fireEvent.press(screen.getByTestId('login-apple-button'));

    await waitFor(() => expect(signInWithApple).toHaveBeenCalled());
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('tells the rider when a sign-in fails', async () => {
    (signInWithApple as jest.Mock).mockRejectedValue(new Error('network'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<SocialSignIn onSignedIn={jest.fn()} />);

    fireEvent.press(screen.getByTestId('login-apple-button'));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('login.signInFailed', 'login.signInFailedMessage'));
  });
});
