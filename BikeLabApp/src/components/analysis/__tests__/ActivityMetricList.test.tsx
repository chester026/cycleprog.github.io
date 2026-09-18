import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {ActivityMetricList} from '../ActivityMetricList';

// ActivityMetricList formats dates via getDateLocale(), which pulls in the
// real i18n module (react-native-localize/AsyncStorage) — not relevant to
// what this test asserts, so it's swapped out for a fixed locale.
jest.mock('../../../i18n/dateLocale', () => ({
  getDateLocale: () => 'en-US',
}));

const items = [
  {id: '1', name: 'Morning ride', date: '2025-05-01', valueLabel: '312W', badgeText: 'Power meter'},
  {id: '2', name: 'Evening ride', date: '2025-05-02', valueLabel: '298W'},
  {id: '3', name: 'Hill repeats', date: '2025-05-03', valueLabel: '280W'},
];

describe('ActivityMetricList', () => {
  it('renders a row (value + name + rank) for every item', () => {
    render(<ActivityMetricList title="Top 5" items={items} />);
    expect(screen.getByText('Top 5')).toBeTruthy();
    expect(screen.getByText('312W')).toBeTruthy();
    expect(screen.getByText('Morning ride')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('298W')).toBeTruthy();
    expect(screen.getByText('#2')).toBeTruthy();
    expect(screen.getByText('280W')).toBeTruthy();
    expect(screen.getByText('#3')).toBeTruthy();
    expect(screen.getByText('Power meter')).toBeTruthy();
  });

  it('renders nothing for an empty list', () => {
    const {toJSON} = render(<ActivityMetricList title="Top 5" items={[]} />);
    expect(toJSON()).toBeNull();
  });
});
