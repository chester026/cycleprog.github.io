import React from 'react';
import {render, screen, waitFor} from '@testing-library/react-native';
import {FTPAnalysis} from '../FTPAnalysis';

// FTPAnalysis doesn't use react-native-gifted-charts/useChartOverlay (it's
// the one *Analysis component with a genuinely different layout — see
// src/components/analysis/README.md) but it does pull in native modules
// (i18n, keychain-backed apiFetch, a gradient view) this test doesn't need
// real implementations of.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('react-native-linear-gradient', () => {
  const {View} = require('react-native');
  return View;
});
jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn().mockResolvedValue({totalMinutes: 42, totalIntervals: 3, hrThreshold: 160}),
}));
// The hero block's background image isn't resolvable under the jest
// preset's default asset extensions (no jest.config.js change belongs in
// this task) — a `virtual` mock stands in for the real webp asset.
jest.mock('../../assets/img/mostrecomended.webp', () => 1, {virtual: true});

const activities = Array.from({length: 5}, (_, i) => ({
  id: `${i}`,
  type: 'Ride',
  start_date: `2025-05-0${i + 1}`,
}));

describe('FTPAnalysis', () => {
  it('renders the FTP workload stats once the server call resolves', async () => {
    render(
      <FTPAnalysis activities={activities as any} userProfile={{max_hr: 190}} vo2max={55} />,
    );
    await waitFor(() => expect(screen.getByText('42')).toBeTruthy());
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('ftpAnalysis.minutesThreshold')).toBeTruthy();
    expect(screen.getByText('ftpAnalysis.highIntensity')).toBeTruthy();
  });

  it('renders nothing once loaded when vo2max is unknown', async () => {
    const {toJSON} = render(<FTPAnalysis activities={activities as any} userProfile={{}} vo2max={null} />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });
});
