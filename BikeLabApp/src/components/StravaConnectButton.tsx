// Strava's official "Connect with Strava" button. The lettering, the logo
// and the colours are Strava's own files (assets/img/btn_strava_connect_with_
// {orange,white}.svg) and are never redrawn or recoloured — the lettering is
// part of the artwork, so it reads the same in every language. Use it
// wherever the app starts the Strava connection.
//
// By default it is drawn exactly as supplied: 237 × 48 pt. `fullWidth` is the
// one liberty taken with it (owner, 18.11.2026): the artwork keeps its
// supplied size and sits centred on a full-width pill of its own colour, so
// the button lines up with the app's other full-width actions while the
// lettering and logo stay as small as Strava draws them.
import React from 'react';
import {TouchableOpacity, type StyleProp, type ViewStyle} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {useTranslation} from 'react-i18next';
import {BTN_STRAVA_CONNECT_WITH_ORANGE_XML} from '../assets/img/btnStravaConnectWithOrangeXml';
import {BTN_STRAVA_CONNECT_WITH_WHITE_XML} from '../assets/img/btnStravaConnectWithWhiteXml';
import {makeStyles} from '../theme';

// The artwork's own box (its viewBox is 237 × 48).
const WIDTH = 237;
const HEIGHT = 48;
// The full-width pill's height.
const PILL_HEIGHT = 56;

export interface StravaConnectButtonProps {
  onPress?: () => void;
  disabled?: boolean;
  /** Strava supplies two: orange with white lettering (default), white with orange. */
  color?: 'orange' | 'white';
  /** A full-width pill with the artwork centred on it, instead of the supplied 237 × 48 box. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const StravaConnectButton: React.FC<StravaConnectButtonProps> = ({
  onPress,
  disabled = false,
  color = 'orange',
  fullWidth = false,
  style,
  testID,
}) => {
  const {t} = useTranslation();
  const xml = color === 'white' ? BTN_STRAVA_CONNECT_WITH_WHITE_XML : BTN_STRAVA_CONNECT_WITH_ORANGE_XML;
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t('strava.connect')}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[
        fullWidth ? styles.fullWidth : styles.supplied,
        fullWidth && (color === 'white' ? styles.fillWhite : styles.fillOrange),
        disabled && styles.disabled,
        style,
      ]}>
      <SvgXml xml={xml} width={WIDTH} height={HEIGHT} />
    </TouchableOpacity>
  );
};

const styles = makeStyles(theme => ({
  supplied: {
    width: WIDTH,
    height: HEIGHT,
    alignSelf: 'flex-start',
  },
  fullWidth: {
    width: '100%',
    height: PILL_HEIGHT,
    borderRadius: theme.radii.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The pill is the artwork's own colour, so the two read as one button.
  fillOrange: {
    backgroundColor: theme.colors.strava.connectButtonOrange,
  },
  fillWhite: {
    backgroundColor: theme.colors.surfaceElevated,
  },
  disabled: {
    opacity: 0.5,
  },
}));
