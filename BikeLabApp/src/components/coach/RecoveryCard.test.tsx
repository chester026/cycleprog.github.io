import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {RecoveryCard} from './RecoveryCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

const context = {
  recovery_score: 78,
  resting_hr_bpm: 54,
  resting_hr_baseline_bpm: null,
  hrv_ms: 52.3,
  hrv_baseline_ms: null,
  sleep_hours: 7.4,
  sleep_deep_pct: null,
  weight_kg: null,
  weight_trend_30d_kg: null,
  vo2max: null,
  data_freshness: '2026-11-10',
};

// Garmin supplements whichever source fills the card (owner decision
// 10.11.2026): two more rows, never the score.
describe('RecoveryCard with Garmin extras', () => {
  it('adds Body Battery and stress rows under the source\'s own rows', () => {
    render(
      <RecoveryCard
        context={context}
        garmin={{day: '2026-11-10', body_battery_high: 88, body_battery_low: 19, stress_avg: 28}}
      />,
    );
    expect(screen.getByText('78')).toBeTruthy();
    expect(screen.getByText('coach.recoverySleep')).toBeTruthy();
    expect(screen.getByText('coach.recoveryBodyBattery')).toBeTruthy();
    expect(screen.getByText('19–88')).toBeTruthy();
    expect(screen.getByText('coach.recoveryStress')).toBeTruthy();
    expect(screen.getByText('28')).toBeTruthy();
  });

  it('shows only the figure Garmin has, and the peak alone without a low', () => {
    const {rerender} = render(
      <RecoveryCard context={context} garmin={{day: '2026-11-10', body_battery_high: 61, body_battery_low: null, stress_avg: null}} />,
    );
    expect(screen.getByText('61')).toBeTruthy();
    expect(screen.queryByText('coach.recoveryStress')).toBeNull();

    rerender(<RecoveryCard context={context} garmin={{day: '2026-11-10', body_battery_high: null, body_battery_low: null, stress_avg: 40}} />);
    expect(screen.queryByText('coach.recoveryBodyBattery')).toBeNull();
    expect(screen.getByText('40')).toBeTruthy();
  });

  it('is unchanged without Garmin', () => {
    const {rerender} = render(<RecoveryCard context={context} />);
    expect(screen.queryByText('coach.recoveryBodyBattery')).toBeNull();
    expect(screen.queryByText('coach.recoveryStress')).toBeNull();
    rerender(<RecoveryCard context={context} garmin={null} />);
    expect(screen.queryByText('coach.recoveryBodyBattery')).toBeNull();
  });

  it('a Garmin-only rider gets the rows without a score', () => {
    render(
      <RecoveryCard
        context={{...context, recovery_score: null}}
        garmin={{day: '2026-11-10', body_battery_high: 88, body_battery_low: 19, stress_avg: 28}}
      />,
    );
    expect(screen.getByText('coach.recoveryNoScore')).toBeTruthy();
    expect(screen.getByText('19–88')).toBeTruthy();
  });
});
