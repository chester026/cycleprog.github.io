import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {RideHeader} from './RideHeader';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

describe('RideHeader', () => {
  it('calls onBack when the back button is pressed', () => {
    const onBack = jest.fn();
    render(<RideHeader onBack={onBack} onRefresh={() => {}} refreshing={false} />);
    fireEvent.press(screen.getByText('←'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls onRefresh when the refresh button is pressed, and disables it while refreshing', () => {
    const onRefresh = jest.fn();
    const {rerender} = render(<RideHeader onBack={() => {}} onRefresh={onRefresh} refreshing={false} />);
    fireEvent.press(screen.getByText('refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(<RideHeader onBack={() => {}} onRefresh={onRefresh} refreshing />);
    fireEvent.press(screen.getByText('p'));
    expect(onRefresh).toHaveBeenCalledTimes(1); // disabled — no second call
  });
});
