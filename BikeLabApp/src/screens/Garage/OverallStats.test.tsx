import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {OverallStats} from './OverallStats';

const mockNavigate = jest.fn();
jest.mock('../../navigation/hooks', () => ({
  useAppNavigation: () => ({navigate: mockNavigate}),
}));

describe('OverallStats', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders the totals passed in', () => {
    render(
      <OverallStats
        stats={{totalDistance: 123, totalElevation: 456, totalTime: 7.8, avgSpeed: 25.4}}
      />,
    );
    expect(screen.getByText('123')).toBeTruthy();
    expect(screen.getByText('456')).toBeTruthy();
    expect(screen.getByText('25.4')).toBeTruthy();
    expect(screen.getByText('7.8')).toBeTruthy();
  });

  it('navigates to Activities when a card is pressed', () => {
    render(
      <OverallStats
        stats={{totalDistance: 111, totalElevation: 222, totalTime: 3.3, avgSpeed: 4.4}}
      />,
    );
    // The value Text is a direct child of the card's TouchableOpacity.
    fireEvent.press(screen.getByText('111').parent!);
    expect(mockNavigate).toHaveBeenCalledWith('Activities');
  });
});
