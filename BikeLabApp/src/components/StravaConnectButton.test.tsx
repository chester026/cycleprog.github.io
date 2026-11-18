import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {StravaConnectButton} from './StravaConnectButton';
import {BTN_STRAVA_CONNECT_WITH_ORANGE_XML} from '../assets/img/btnStravaConnectWithOrangeXml';
import {BTN_STRAVA_CONNECT_WITH_WHITE_XML} from '../assets/img/btnStravaConnectWithWhiteXml';

// The app's TypeScript setup has no Node typings; the test runs in Node.
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

describe('StravaConnectButton', () => {
  it("draws Strava's own files, unchanged", () => {
    const read = (name: string) => fs.readFileSync(path.join(__dirname, '../assets/img', name), 'utf8');
    expect(BTN_STRAVA_CONNECT_WITH_ORANGE_XML).toBe(read('btn_strava_connect_with_orange.svg'));
    expect(BTN_STRAVA_CONNECT_WITH_WHITE_XML).toBe(read('btn_strava_connect_with_white.svg'));
  });

  it('is a button that starts the connection', () => {
    const onPress = jest.fn();
    render(<StravaConnectButton onPress={onPress} testID="connect" />);

    const button = screen.getByTestId('connect');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('strava.connect');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('works the same in the white, full-width form', () => {
    const onPress = jest.fn();
    render(<StravaConnectButton color="white" fullWidth onPress={onPress} testID="connect" />);
    fireEvent.press(screen.getByTestId('connect'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', () => {
    const onPress = jest.fn();
    render(<StravaConnectButton onPress={onPress} disabled testID="connect" />);
    fireEvent.press(screen.getByTestId('connect'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
