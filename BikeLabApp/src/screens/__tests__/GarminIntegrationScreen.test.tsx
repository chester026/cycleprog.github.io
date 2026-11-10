import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {GarminIntegrationScreen} from '../GarminIntegrationScreen';
import {useGarminDevices} from '../../data/hooks/useGarminDevices';
import {useGarminConnectStatus} from '../../data/hooks/useGarminConnectStatus';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${Object.values(opts).join(',')}` : key,
  }),
}));

jest.mock('../../hooks/useTabBarBottomPadding', () => ({
  useTabBarBottomPadding: () => 0,
}));

jest.mock('../../data/hooks/useGarminDevices', () => ({
  useGarminDevices: jest.fn(),
}));

jest.mock('../../data/hooks/useGarminMutations', () => ({
  useConfirmGarminPairing: () => ({mutateAsync: jest.fn(), isPending: false}),
  useRemoveGarminDevice: () => ({mutateAsync: jest.fn(), isPending: false}),
  useGarminConnectSync: () => ({mutate: jest.fn(), isPending: false}),
}));

jest.mock('../../data/hooks/useGarminConnectStatus', () => ({
  useGarminConnectStatus: jest.fn(),
}));

const mockedDevices = useGarminDevices as jest.Mock;
const mockedStatus = useGarminConnectStatus as jest.Mock;

const navigation = {goBack: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true)} as any;

describe('GarminIntegrationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDevices.mockReturnValue({data: [], isLoading: false, isError: false});
  });

  it('shows both halves: Garmin Connect as a ride source, then the Edge pairing', () => {
    mockedStatus.mockReturnValue({
      data: {
        connected: true,
        available: false,
        transport: 'personal',
        connected_at: '2026-11-10T08:00:00.000Z',
        last_sync_at: '2026-11-10T08:05:00.000Z',
        activities: 172,
        last_activity_at: '2026-11-08T09:58:38.000Z',
        health_days: 0,
        last_health_day: null,
        health_latest: null,
      },
      isLoading: false,
    });
    render(<GarminIntegrationScreen navigation={navigation} />);

    expect(screen.getByText('garmin.title')).toBeTruthy();
    expect(screen.getByTestId('garmin-connect-card')).toBeTruthy();
    expect(screen.getByText('garmin.connectStatusOn')).toBeTruthy();
    expect(screen.getByText('172')).toBeTruthy();

    expect(screen.getByText('garmin.edgeTitle')).toBeTruthy();
    expect(screen.getByText('garmin.pairTitle')).toBeTruthy();
    expect(screen.getByTestId('garmin-code-input')).toBeTruthy();
    expect(screen.getByText('garmin.noDevices')).toBeTruthy();
  });

  it('the Edge pairing works the same for a rider with no Garmin Connect link', () => {
    mockedStatus.mockReturnValue({
      data: {
        connected: false,
        available: false,
        transport: null,
        connected_at: null,
        last_sync_at: null,
        activities: 0,
        last_activity_at: null,
        health_days: 0,
        last_health_day: null,
        health_latest: null,
      },
      isLoading: false,
    });
    mockedDevices.mockReturnValue({
      data: [{id: 3, device_id: 'x', device_name: 'Edge 1040', paired_at: '2026-10-01T10:00:00.000Z', last_seen_at: null}],
      isLoading: false,
      isError: false,
    });
    render(<GarminIntegrationScreen navigation={navigation} />);

    expect(screen.getByText('garmin.connectStatusOff')).toBeTruthy();
    expect(screen.getByText('garmin.connectButton')).toBeDisabled();
    expect(screen.getByText('Edge 1040')).toBeTruthy();
    expect(screen.getByTestId('garmin-remove-3')).toBeTruthy();
  });
});
