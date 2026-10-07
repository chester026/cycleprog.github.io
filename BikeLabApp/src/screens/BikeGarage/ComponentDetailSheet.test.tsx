import React from 'react';
import {Animated} from 'react-native';
import {fireEvent, render, screen} from '@testing-library/react-native';
import {ComponentDetailSheet} from './ComponentDetailSheet';
import type {ComponentHealth} from './types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

function cassette(overrides: Partial<ComponentHealth> = {}): ComponentHealth {
  return {
    id: 'cassette',
    healthPercent: 40,
    kmSinceReset: 15200,
    effectiveKm: 15200,
    baseLifecycle: 30000,
    remainingKm: 14800,
    status: 'warning',
    weightFactor: 1,
    styleFactor: 1,
    lastResetAt: null,
    lastResetKm: 0,
    initialKm: 0,
    ...overrides,
  };
}

function renderSheet(component: ComponentHealth, onReset = jest.fn()) {
  render(
    <ComponentDetailSheet
      visible
      component={component}
      componentLabels={undefined}
      slideAnim={new Animated.Value(1)}
      onClose={jest.fn()}
      onReset={onReset}
    />,
  );
  return onReset;
}

describe('ComponentDetailSheet used-bike mileage', () => {
  it('notes the km before tracking only when the part has some', () => {
    renderSheet(cassette({initialKm: 15000}));
    expect(screen.getByTestId('component-initial-km-note')).toBeTruthy();
  });

  it('shows no note for a part without pre-tracking km', () => {
    renderSheet(cassette());
    expect(screen.queryByTestId('component-initial-km-note')).toBeNull();
  });

  it('resets as a new part (0 km) while the Advanced section is closed', () => {
    const onReset = renderSheet(cassette());
    expect(screen.queryByTestId('reset-initial-km-input')).toBeNull();

    fireEvent.press(screen.getByText('bikeGarage.markReplaced'));
    expect(onReset).toHaveBeenCalledWith('cassette', 0);
  });

  it('passes the typed km through when the Advanced section is open', () => {
    const onReset = renderSheet(cassette());

    fireEvent.press(screen.getByTestId('advanced-toggle'));
    fireEvent.changeText(screen.getByTestId('reset-initial-km-input'), '12000');
    fireEvent.press(screen.getByText('bikeGarage.markReplaced'));

    expect(onReset).toHaveBeenCalledWith('cassette', 12000);
  });
});
