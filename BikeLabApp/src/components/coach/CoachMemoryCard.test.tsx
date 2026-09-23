import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {CoachMemoryCard} from './CoachMemoryCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: {note?: string}) => {
      if (key === 'coach.memoryRemembered') return `Remembered: ${opts?.note}`;
      if (key === 'coach.memoryForgot') return `Forgot: ${opts?.note}`;
      return key;
    },
  }),
}));

describe('CoachMemoryCard', () => {
  it('shows "Remembered: X" for a remembered note', () => {
    render(<CoachMemoryCard update={{type: 'remembered', note: 'Prefers morning rides'}} onPress={jest.fn()} />);
    expect(screen.getByText('Remembered: Prefers morning rides')).toBeTruthy();
  });

  it('shows "Forgot: X" for a forgotten note', () => {
    render(<CoachMemoryCard update={{type: 'forgotten', note: 'Knee hurts on climbs'}} onPress={jest.fn()} />);
    expect(screen.getByText('Forgot: Knee hurts on climbs')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<CoachMemoryCard update={{type: 'remembered', note: 'x'}} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('coach-memory-card'));
    expect(onPress).toHaveBeenCalled();
  });
});
