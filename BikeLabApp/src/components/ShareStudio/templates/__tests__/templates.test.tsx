import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {TemplateA} from '../TemplateA';
import {TemplateB} from '../TemplateB';
import {TemplateC} from '../TemplateC';
import {TemplateD} from '../TemplateD';
import {TemplateE} from '../TemplateE';
import {TemplateF} from '../TemplateF';
import {TemplateProps} from '../../types';
import {formatDistanceKm, formatDistanceKmComma, formatDuration, formatDurationPadded, formatDurationWithSeconds} from '../../format';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('../../../../i18n/dateLocale', () => ({getDateLocale: () => 'en-US'}));

// None of these native/chart libs ship a jest-friendly CJS build under the
// react-native preset's transformIgnorePatterns — mocked with plain Views,
// same approach the existing HeartAnalysis/FTPAnalysis tests use for
// react-native-gifted-charts.
jest.mock('react-native-maps', () => {
  const {View} = require('react-native');
  return {__esModule: true, default: View, Polyline: View, PROVIDER_DEFAULT: 'default'};
});
jest.mock('react-native-gifted-charts', () => {
  const {View} = require('react-native');
  return {LineChart: View, BarChart: View};
});
jest.mock('react-native-color-matrix-image-filters', () => {
  const {View} = require('react-native');
  return {Grayscale: View};
});

// `jest.mock` calls are hoisted above imports by babel-plugin-jest-hoist
// only when written as literal top-level call expressions (a loop over
// these paths would run after the imports below already executed the real
// `require()`s), so each asset gets its own line.
jest.mock('../../../../assets/img/shareTemplates/template1.webp', () => 1, {virtual: true});
jest.mock('../../../../assets/img/shareTemplates/template2.webp', () => 1, {virtual: true});
jest.mock('../../../../assets/img/shareTemplates/template3.webp', () => 1, {virtual: true});
jest.mock('../../../../assets/img/shareTemplates/template4.webp', () => 1, {virtual: true});
jest.mock('../../../../assets/img/shareTemplates/template5.webp', () => 1, {virtual: true});
jest.mock('../../../../assets/img/shareTemplates/logos/ride_w.png', () => 1, {virtual: true});
jest.mock('../../../../assets/img/shareTemplates/logos/symbol.png', () => 1, {virtual: true});
jest.mock('../../../../assets/img/shareTemplates/logos/BIKELAB.png', () => 1, {virtual: true});
jest.mock('../../../../assets/img/shareTemplates/logos/logo_blue.png', () => 1, {virtual: true});
jest.mock('../../../../assets/img/shareTemplates/logos/logo_vertical.png', () => 1, {virtual: true});

const activity: TemplateProps['activity'] = {
  id: 1,
  name: 'Sunday Long Ride',
  type: 'Ride',
  start_date: '2025-03-04T10:00:00Z',
  distance: 20000, // 20.0 km
  moving_time: 3665, // 1h 1m 5s
  elapsed_time: 3700,
  total_elevation_gain: 245.6, // rounds to 246
  average_speed: 7, // 25.2 km/h
  max_speed: 10, // 36.0 km/h
  average_heartrate: 145,
  average_cadence: 80,
};

const streams: TemplateProps['streams'] = {
  velocity_smooth: {data: [5, 6, 7, 8, 7]},
  heartrate: {data: [130, 140, 150, 145, 140]},
  cadence: {data: [70, 75, 80, 85, 80]},
};

const trackCoordinates = [
  {latitude: 50.45, longitude: 30.52},
  {latitude: 50.46, longitude: 30.53},
];

const baseProps: TemplateProps = {
  activity,
  backgroundType: 'branded1',
  trackCoordinates,
  streams,
  isGrayscale: false,
  mapStyle: 'dark',
};

describe('TemplateA', () => {
  it('renders the activity name and formatted stats', () => {
    render(<TemplateA {...baseProps} />);
    expect(screen.getByText('Sunday Long Ride')).toBeTruthy();
    expect(screen.getByText(`${formatDistanceKm(activity.distance)} km`)).toBeTruthy();
    expect(screen.getByText('246')).toBeTruthy();
    expect(screen.getByText(formatDurationWithSeconds(activity.moving_time))).toBeTruthy();
  });
});

describe('TemplateB', () => {
  it('renders the activity name and formatted stats over the route map', () => {
    render(<TemplateB {...baseProps} backgroundType="branded1" />);
    expect(screen.getByText('Sunday Long Ride')).toBeTruthy();
    expect(screen.getByText(`${formatDistanceKm(activity.distance)} km`)).toBeTruthy();
    expect(screen.getByText('246 m')).toBeTruthy();
    expect(screen.getByText(formatDurationPadded(activity.moving_time))).toBeTruthy();
  });

  it('falls back to a "no route data" placeholder with no track', () => {
    render(<TemplateB {...baseProps} trackCoordinates={[]} />);
    expect(screen.getByText('shareStudio.noRouteData')).toBeTruthy();
  });
});

describe('TemplateC', () => {
  it('renders the activity name and formatted stats', () => {
    render(<TemplateC {...baseProps} backgroundType="branded2" />);
    expect(screen.getByText('Sunday Long Ride')).toBeTruthy();
    expect(screen.getByText(`${formatDistanceKm(activity.distance)} km`)).toBeTruthy();
    expect(screen.getByText('246')).toBeTruthy();
  });
});

describe('TemplateD', () => {
  it('renders the activity name, distance and a speed chart card', () => {
    render(<TemplateD {...baseProps} backgroundType="branded1" />);
    expect(screen.getByText('Sunday Long Ride')).toBeTruthy();
    expect(screen.getByText(`${formatDistanceKm(activity.distance)} km`)).toBeTruthy();
    expect(screen.getByText('common.heartRate')).toBeTruthy();
  });
});

describe('TemplateE', () => {
  it('renders the activity name and formatted stats', () => {
    render(<TemplateE {...baseProps} backgroundType="branded1" />);
    expect(screen.getByText('Sunday Long Ride')).toBeTruthy();
    expect(screen.getByText(`${formatDistanceKm(activity.distance)} km`)).toBeTruthy();
    expect(screen.getByText('246 m')).toBeTruthy();
    expect(screen.getByText(formatDuration(activity.moving_time))).toBeTruthy();
  });
});

describe('TemplateF', () => {
  it('renders the activity name, comma-decimal distance and elevation/time stats', () => {
    render(<TemplateF {...baseProps} />);
    expect(screen.getByText('Sunday Long Ride')).toBeTruthy();
    expect(screen.getByText(formatDistanceKmComma(activity.distance))).toBeTruthy();
    expect(screen.getByText('246 m')).toBeTruthy();
    expect(screen.getByText(formatDuration(activity.moving_time))).toBeTruthy();
  });
});
