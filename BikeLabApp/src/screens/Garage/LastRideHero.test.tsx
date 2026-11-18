import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {LastRideHero} from './LastRideHero';
import type {Activity} from '../../types/activity';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

// ./lib formats the ride date through i18n, which loads a native module.
jest.mock('./lib', () => ({formatRideDate: () => '1 Nov'}));

jest.mock('react-native-maps', () => {
  const {View} = require('react-native');
  return {__esModule: true, default: View, Polyline: View, PROVIDER_DEFAULT: null};
});

jest.mock('react-native-linear-gradient', () => {
  const {View} = require('react-native');
  return {__esModule: true, default: View};
});

const ride = {
  id: 1,
  name: 'Morning Ride',
  start_date: '2026-11-01T07:00:00Z',
  distance: 42300,
  average_speed: 7.5,
  total_elevation_gain: 512,
} as Activity;

const base = {trackCoordinates: [], mapRegion: null, onShare: jest.fn(), onAnalyze: jest.fn()};

describe('LastRideHero', () => {
  it('shows the last ride and its three figures', () => {
    render(<LastRideHero {...base} lastRide={ride} />);

    expect(screen.getByText('Morning Ride')).toBeTruthy();
    expect(screen.getByText('42.3')).toBeTruthy();
    expect(screen.getByText('27.0')).toBeTruthy();
    expect(screen.getByText('512')).toBeTruthy();
    expect(screen.getByText('garage.analyzeRide')).toBeTruthy();
    expect(screen.queryByTestId('garage-connect-source')).toBeNull();
  });

  it('becomes the "connect your rides" state for an account with no ride source', () => {
    const onConnectSource = jest.fn();
    render(<LastRideHero {...base} lastRide={null} onConnectSource={onConnectSource} />);

    // The banner takes the card's place: headline, title and text.
    expect(screen.getByTestId('garage-connect-source')).toBeTruthy();
    expect(screen.getByText('garage.connectSourceHeadline')).toBeTruthy();
    expect(screen.getByText('garage.connectSourceTitle')).toBeTruthy();
    expect(screen.getByText('garage.connectSourceBody')).toBeTruthy();
    // Nothing that belongs to a ride: no date, no figures, no analyze, no "no track".
    expect(screen.queryByText('1 Nov')).toBeNull();
    expect(screen.queryByText('garage.analyzeRide')).toBeNull();
    expect(screen.queryByText('common.distance')).toBeNull();
    expect(screen.queryByText('garage.noTrackData')).toBeNull();

    // The one ride source today: Strava's own button.
    const strava = screen.getByTestId('garage-connect-strava');
    expect(strava.props.accessibilityLabel).toBe('strava.connect');
    fireEvent.press(strava);
    expect(onConnectSource).toHaveBeenCalledTimes(1);
  });
});
