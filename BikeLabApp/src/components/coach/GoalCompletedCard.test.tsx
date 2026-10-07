import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {GoalCompletedCard} from './GoalCompletedCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: {count?: number}) => (key === 'coach.goalCompletedRides' ? `${opts?.count} rides attached` : key),
  }),
}));

describe('GoalCompletedCard', () => {
  it('shows eyebrow, title and ride count, and opens the goal on tap', () => {
    const onPress = jest.fn();
    render(<GoalCompletedCard goal={{goalId: 4, title: 'Gran Fondo', ridesCount: 2}} onPress={onPress} />);
    expect(screen.getByText('coach.goalCompletedLabel')).toBeTruthy();
    expect(screen.getByText('Gran Fondo')).toBeTruthy();
    expect(screen.getByText('2 rides attached')).toBeTruthy();
    fireEvent.press(screen.getByText('Gran Fondo'));
    expect(onPress).toHaveBeenCalled();
  });

  it('omits the rides line when none were attached', () => {
    render(<GoalCompletedCard goal={{goalId: 4, title: 'Base', ridesCount: 0}} onPress={jest.fn()} />);
    expect(screen.queryByText(/rides attached/)).toBeNull();
  });
});
