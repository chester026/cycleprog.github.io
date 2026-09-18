import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {PeriodHeader} from './PeriodHeader';
import type {HeroSummary, PlanInfo} from './lib';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

const heroSummary: HeroSummary = {
  totalRides: 8,
  totalKm: 240,
  totalTime: 12,
  totalElevation: 1500,
  longRidesCount: 2,
  plan: {rides: 12, km: 400, long: 4},
  progress: {rides: 67, km: 60, long: 50},
};

const planInfo: PlanInfo = {
  description: 'Balanced intermediate plan',
  details: '5h/week - 3 rides/week',
};

describe('PeriodHeader', () => {
  it('renders the empty state when there is no hero summary', () => {
    render(<PeriodHeader heroSummary={null} planInfo={null} />);
    expect(screen.getByText('analysis.noData')).toBeTruthy();
  });

  it('renders progress percentages and plan info when data is present', () => {
    render(<PeriodHeader heroSummary={heroSummary} planInfo={planInfo} />);
    expect(screen.getByText('67%')).toBeTruthy();
    expect(screen.getByText('8 / 12')).toBeTruthy();
    expect(screen.getByText('Balanced intermediate plan')).toBeTruthy();
    expect(screen.getByText('5h/week - 3 rides/week')).toBeTruthy();
  });
});
