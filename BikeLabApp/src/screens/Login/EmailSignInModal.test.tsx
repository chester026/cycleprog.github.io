import React from 'react';
import {Alert} from 'react-native';
import {render, screen, fireEvent, waitFor} from '@testing-library/react-native';
import {EmailSignInModal} from './EmailSignInModal';
import {api, auth} from '../../data/api';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

jest.mock('../../config', () => ({WEB_BASE_URL: 'https://bikelab.app'}));

jest.mock('../../lib/logger', () => ({logger: {error: jest.fn(), debug: jest.fn()}}));

jest.mock('../../data/api', () => ({
  api: {call: jest.fn()},
  auth: {login: {name: 'login'}},
}));

const call = api.call as jest.Mock;

const fillAndSubmit = (email: string, password: string) => {
  fireEvent.changeText(screen.getByTestId('login-email-input'), email);
  fireEvent.changeText(screen.getByTestId('login-password-input'), password);
  fireEvent.press(screen.getByTestId('login-submit-button'));
};

describe('EmailSignInModal', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('hands the session to the screen after a sign-in', async () => {
    call.mockResolvedValue({token: 'jwt', refreshToken: 'refresh'});
    const onSignedIn = jest.fn();
    render(<EmailSignInModal visible onClose={jest.fn()} onSignedIn={onSignedIn} />);

    fillAndSubmit('  rider@example.com ', 'secret');

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith({token: 'jwt', refreshToken: 'refresh'}));
    // The address goes out without the stray spaces autofill tends to add.
    expect(call).toHaveBeenCalledWith(auth.login, {body: {email: 'rider@example.com', password: 'secret'}});
    expect(alert).not.toHaveBeenCalled();
  });

  it('asks for both fields before calling the server', () => {
    render(<EmailSignInModal visible onClose={jest.fn()} onSignedIn={jest.fn()} />);

    fillAndSubmit('rider@example.com', '');

    expect(alert).toHaveBeenCalledWith('common.error', 'login.errorEmpty');
    expect(call).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the sign-in is refused and stays open", async () => {
    call.mockRejectedValue(new Error('Invalid email or password'));
    const onSignedIn = jest.fn();
    const onClose = jest.fn();
    render(<EmailSignInModal visible onClose={onClose} onSignedIn={onSignedIn} />);

    fillAndSubmit('rider@example.com', 'wrong');

    await waitFor(() => expect(alert).toHaveBeenCalledWith('login.loginFailed', 'Invalid email or password'));
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('submits from the keyboard on the password field', async () => {
    call.mockResolvedValue({token: 'jwt', refreshToken: 'refresh'});
    const onSignedIn = jest.fn();
    render(<EmailSignInModal visible onClose={jest.fn()} onSignedIn={onSignedIn} />);

    fireEvent.changeText(screen.getByTestId('login-email-input'), 'rider@example.com');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'secret');
    fireEvent(screen.getByTestId('login-password-input'), 'submitEditing');

    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });

  it('closes on Cancel', () => {
    const onClose = jest.fn();
    render(<EmailSignInModal visible onClose={onClose} onSignedIn={jest.fn()} />);

    fireEvent.press(screen.getByTestId('login-email-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('forgets a typed password once closed, keeps the address', () => {
    const props = {onClose: jest.fn(), onSignedIn: jest.fn()};
    const {rerender} = render(<EmailSignInModal visible {...props} />);
    fireEvent.changeText(screen.getByTestId('login-email-input'), 'rider@example.com');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'secret');

    rerender(<EmailSignInModal visible={false} {...props} />);
    rerender(<EmailSignInModal visible {...props} />);

    expect(screen.getByTestId('login-email-input').props.value).toBe('rider@example.com');
    expect(screen.getByTestId('login-password-input').props.value).toBe('');
  });
});
