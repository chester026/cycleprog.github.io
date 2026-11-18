import React from 'react';
import {render, screen, fireEvent, waitFor} from '@testing-library/react-native';
import {Step4RideSource} from './Step4RideSource';
import {useStravaStatus} from '../../data/hooks/useStravaStatus';
import {startStravaLink} from '../../auth/strava';
import {handleStravaLinkResult} from '../../auth/stravaLinkResult';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('../../data/hooks/useStravaStatus', () => ({useStravaStatus: jest.fn()}));
jest.mock('../../auth/strava', () => ({startStravaLink: jest.fn()}));
jest.mock('../../auth/stravaLinkResult', () => ({handleStravaLinkResult: jest.fn()}));
jest.mock('../../lib/logger', () => ({logger: {error: jest.fn(), debug: jest.fn()}}));

const mockedStatus = useStravaStatus as jest.Mock;

describe('Step4RideSource', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers to connect Strava and starts the link flow', async () => {
    mockedStatus.mockReturnValue({status: {connected: false}});
    (startStravaLink as jest.Mock).mockResolvedValue(undefined);
    render(<Step4RideSource />);

    fireEvent.press(screen.getByTestId('onboarding-connect-strava'));

    await waitFor(() => expect(startStravaLink).toHaveBeenCalledTimes(1));
    expect(screen.getByText('onboarding.rideSourceLater')).toBeTruthy();
  });

  it('shows the connected state instead of the button once Strava is linked', () => {
    mockedStatus.mockReturnValue({status: {connected: true}});
    render(<Step4RideSource />);

    expect(screen.getByText('onboarding.rideSourceConnected')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-connect-strava')).toBeNull();
  });

  it('reports a failure to open Strava through the shared handler', async () => {
    mockedStatus.mockReturnValue({status: {connected: false}});
    (startStravaLink as jest.Mock).mockRejectedValue(new Error('cannot open'));
    render(<Step4RideSource />);

    fireEvent.press(screen.getByTestId('onboarding-connect-strava'));

    await waitFor(() => expect(handleStravaLinkResult).toHaveBeenCalledWith({ok: false}));
  });
});
