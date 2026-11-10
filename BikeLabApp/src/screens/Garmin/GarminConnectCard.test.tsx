import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';
import {Alert} from 'react-native';
import {GarminConnectCard} from './GarminConnectCard';
import {useGarminConnectStatus} from '../../data/hooks/useGarminConnectStatus';
import {useGarminConnectSync} from '../../data/hooks/useGarminMutations';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${Object.values(opts).join(',')}` : key,
  }),
}));

jest.mock('../../data/hooks/useGarminConnectStatus', () => ({
  useGarminConnectStatus: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({logger: {error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn()}}));

jest.mock('../../data/hooks/useGarminMutations', () => ({
  useGarminConnectSync: jest.fn(),
}));

const mockedStatus = useGarminConnectStatus as jest.Mock;
const mockedSync = useGarminConnectSync as jest.Mock;

const disconnected = {
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
};

const connected = {
  connected: true,
  available: false,
  transport: 'personal',
  connected_at: '2026-11-10T08:00:00.000Z',
  last_sync_at: '2026-11-10T08:05:00.000Z',
  activities: 172,
  last_activity_at: '2026-11-08T09:58:38.000Z',
  health_days: 30,
  last_health_day: '2026-11-09',
  health_latest: {
    day: '2026-11-09',
    sleep_hours: 7.2,
    sleep_score: 81,
    hrv_ms: 48,
    hrv_status: 'BALANCED',
    resting_hr: 47,
    body_battery_high: 88,
    body_battery_low: 19,
    stress_avg: 28,
  },
};

describe('GarminConnectCard', () => {
  const syncMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedSync.mockReturnValue({mutate: syncMutate, isPending: false});
  });

  it('shows a spinner and no status while loading', () => {
    mockedStatus.mockReturnValue({data: undefined, isLoading: true});
    render(<GarminConnectCard />);
    expect(screen.getByText('garmin.connectTitle')).toBeTruthy();
    expect(screen.queryByTestId('garmin-connect-pill')).toBeNull();
    expect(screen.queryByText('garmin.connectButton')).toBeNull();
  });

  it('connected: ride count, latest ride and last sync, no connect button', () => {
    mockedStatus.mockReturnValue({data: connected, isLoading: false});
    render(<GarminConnectCard />);
    expect(screen.getByText('garmin.connectStatusOn')).toBeTruthy();
    expect(screen.getByText('172')).toBeTruthy();
    expect(screen.getByText(new Date(connected.last_activity_at).toLocaleDateString())).toBeTruthy();
    expect(screen.getByText(new Date(connected.last_sync_at).toLocaleDateString())).toBeTruthy();
    expect(screen.queryByText('garmin.connectButton')).toBeNull();
  });

  it('connected: the newest health day with the figures the watch measured', () => {
    mockedStatus.mockReturnValue({data: connected, isLoading: false});
    render(<GarminConnectCard />);
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText(`garmin.healthTitle:${new Date(2026, 10, 9).toLocaleDateString()}`)).toBeTruthy();
    expect(screen.getByText('garmin.healthHoursValue:7.2')).toBeTruthy();
    expect(screen.getByText('81')).toBeTruthy();
    expect(screen.getByText('garmin.healthMsValue:48')).toBeTruthy();
    expect(screen.getByText('garmin.healthBpmValue:47')).toBeTruthy();
    expect(screen.getByText('19–88')).toBeTruthy();
    expect(screen.getByText('28')).toBeTruthy();
  });

  it('a day without a night shows its daytime figures only; no health days, no health block', () => {
    mockedStatus.mockReturnValue({
      data: {...connected, health_latest: {...connected.health_latest, sleep_hours: null, sleep_score: null, hrv_ms: null}},
      isLoading: false,
    });
    const {rerender} = render(<GarminConnectCard />);
    expect(screen.queryByText('garmin.healthSleep')).toBeNull();
    expect(screen.queryByText('garmin.healthHrv')).toBeNull();
    expect(screen.getByText('garmin.healthRestingHr')).toBeTruthy();

    mockedStatus.mockReturnValue({
      data: {...connected, health_days: 0, last_health_day: null, health_latest: null},
      isLoading: false,
    });
    rerender(<GarminConnectCard />);
    expect(screen.queryByTestId('garmin-health-latest')).toBeNull();
    expect(screen.getByText('garmin.connectHealthDays')).toBeTruthy();
  });

  it('says so when the link is the developer key, and not for an OAuth link', () => {
    mockedStatus.mockReturnValue({data: connected, isLoading: false});
    const {rerender} = render(<GarminConnectCard />);
    expect(screen.getByText('garmin.connectPersonalNote')).toBeTruthy();

    mockedStatus.mockReturnValue({data: {...connected, transport: 'oauth'}, isLoading: false});
    rerender(<GarminConnectCard />);
    expect(screen.queryByText('garmin.connectPersonalNote')).toBeNull();
  });

  it('a developer-key connection can be refreshed from the card; a failure is an alert, not a silent no-op', () => {
    mockedStatus.mockReturnValue({data: connected, isLoading: false});
    render(<GarminConnectCard />);
    fireEvent.press(screen.getByText('garmin.refreshHealth'));
    expect(syncMutate).toHaveBeenCalledTimes(1);

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    syncMutate.mock.calls[0][1].onError(new Error('502'));
    expect(alertSpy).toHaveBeenCalledWith('common.error', 'garmin.refreshFailed');
    alertSpy.mockRestore();
  });

  it('no refresh button for a connection Garmin pushes data to, or when not connected', () => {
    mockedStatus.mockReturnValue({data: {...connected, transport: 'oauth'}, isLoading: false});
    const {rerender} = render(<GarminConnectCard />);
    expect(screen.queryByText('garmin.refreshHealth')).toBeNull();

    mockedStatus.mockReturnValue({data: disconnected, isLoading: false});
    rerender(<GarminConnectCard />);
    expect(screen.queryByText('garmin.refreshHealth')).toBeNull();
  });

  it('connected but never synced: dashes instead of dates', () => {
    mockedStatus.mockReturnValue({
      data: {...connected, activities: 0, last_sync_at: null, last_activity_at: null, health_days: 3},
      isLoading: false,
    });
    render(<GarminConnectCard />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('not connected: the connect button is there but disabled, with the "not open yet" note', () => {
    mockedStatus.mockReturnValue({data: disconnected, isLoading: false});
    render(<GarminConnectCard />);
    expect(screen.getByText('garmin.connectStatusOff')).toBeTruthy();
    expect(screen.getByText('garmin.connectSoon')).toBeTruthy();
    expect(screen.getByText('garmin.connectButton')).toBeDisabled();
    expect(screen.queryByText('garmin.connectRides')).toBeNull();
  });

  it('a failed status request is not presented as "not connected"', () => {
    mockedStatus.mockReturnValue({data: undefined, isLoading: false, isError: true});
    render(<GarminConnectCard />);
    expect(screen.getByText('garmin.connectLoadFailed')).toBeTruthy();
    expect(screen.queryByTestId('garmin-connect-pill')).toBeNull();
    expect(screen.queryByText('garmin.connectButton')).toBeNull();
  });
});
