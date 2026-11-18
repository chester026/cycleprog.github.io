// The Garage for an account with no ride source (owner, 18.11.2026): one
// solid dark card — the last-ride card's own ink — where that card would be,
// with Strava's orange button as its one accent.
// A drawn line climbs where that card shows the ride's track on the map —
// the place a real route will take — then a small title, the headline under
// it, a line of text and one button per ride source: Strava today, the others when riders
// can link them.
import React from 'react';
import {View, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Circle, Path} from 'react-native-svg';
import {StravaConnectButton} from '../../components/StravaConnectButton';
import {makeStyles, useTheme, withOpacity} from '../../theme';

// The band of the drawing the line lives in; the card scales it to its
// width. The line enters from beyond the left edge (so it always runs off
// the card, whatever the width) and climbs to the point at the top right.
const ART = {y: 46, width: 377, height: 200};
const ROUTE = 'M-80 244C-50 252 -34 258 -10 236C40 190 62 254 104 216S150 126 196 158S250 230 292 172S330 100 352 84';
// Where the line ends, and a waypoint on the way up.
const END = {x: 352, y: 84};
const WAYPOINT = {x: 104, y: 216};

export interface ConnectRidesBannerProps {
  onConnectStrava: () => void;
}

export const ConnectRidesBanner: React.FC<ConnectRidesBannerProps> = ({onConnectStrava}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const line = theme.colors.text.inverse;

  return (
    <View style={styles.card} testID="garage-connect-source">
      <Svg width="100%" height={ART.height} viewBox={`0 ${ART.y} ${ART.width} ${ART.height}`} fill="none">
        {/* A soft halo under the line, then the line itself. */}
        <Path d={ROUTE} stroke={line} strokeOpacity={0.05} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={ROUTE} stroke={line} strokeOpacity={0.26} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={WAYPOINT.x} cy={WAYPOINT.y} r={4} fill={line} fillOpacity={0.45} />
        <Circle cx={END.x} cy={END.y} r={14} fill={line} fillOpacity={0.16} />
        <Circle cx={END.x} cy={END.y} r={6} fill={line} />
      </Svg>

      <View style={styles.content}>
        <Text style={styles.title}>{t('garage.connectSourceTitle')}</Text>
        <Text style={styles.headline} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
          {t('garage.connectSourceHeadline')}
        </Text>
        <Text style={styles.body}>{t('garage.connectSourceBody')}</Text>

        <View style={styles.sources}>
          <StravaConnectButton fullWidth onPress={onConnectStrava} testID="garage-connect-strava" />
        </View>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  // Margins, radius and shadow are the last-ride card's (./LastRideHero.tsx).
  card: {
    marginHorizontal: theme.spacing[8],
    marginTop: '14%',
    paddingTop: theme.spacing[24],
    borderRadius: 40,
    backgroundColor: theme.colors.ink,
    shadowColor: theme.colors.shadow,
    shadowOffset: {width: 25, height: 20},
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 3,
  },
  content: {
    paddingTop: 56, // beyond the spacing scale — kept literal
    paddingHorizontal: theme.spacing[24],
    paddingBottom: theme.spacing[24],
  },
  headline: {
    fontSize: 52, // display size, used only here — not in the typography scale
    lineHeight: 54,
    fontWeight: '800',
    letterSpacing: -1.5,
    color: theme.colors.text.inverse,
    marginTop: theme.spacing[8],
  },
  // Sits above the headline.
  title: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
  },
  body: {
    fontSize: 15, // not in the typography scale yet — kept literal
    lineHeight: 22,
    color: withOpacity(theme.colors.text.inverse, 0.72),
    marginTop: theme.spacing[16],
  },
  sources: {
    marginTop: 44,
    gap: theme.spacing[12],
  },
}));
