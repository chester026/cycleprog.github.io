// Power profile of one ride: seven bars, one per Coggan zone (owner ask,
// 30.10.2026: "как это заведено вертикальными барами"). Rendered only when
// the ride has a power stream AND the rider has an FTP estimate (zones from
// GET /api/analytics/power-profile); shares come from shared calc's
// `powerZoneDistribution` on the same downsampled stream the mini charts
// draw. One quiet tone for every bar, the dominant zone in the brand accent.
import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {PowerZoneShare} from '@bikelab/shared/calc';
import {makeStyles, useTheme} from '../../theme';
import {ZoneBars} from './ZoneBars';

interface PowerProfileBarsProps {
  shares: PowerZoneShare[];
  ftpWatts: number;
}

// The ride screen is a dark surface with opacity-on-white text (see
// RideStats), so the bars use the same language rather than a theme token.
const BAR_TONE = 'rgba(255, 255, 255, 0.28)';

export const PowerProfileBars: React.FC<PowerProfileBarsProps> = ({shares, ftpWatts}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const dominant = shares.reduce((best, z) => (z.percent > best.percent ? z : best), shares[0]);
  const dominantKey = dominant.percent > 0 ? String(dominant.zone) : '';
  const items = shares.map(z => ({
    key: String(z.zone),
    label: `Z${z.zone}`,
    sublabel: z.maxW === null ? `${z.minW}+` : `${z.maxW}`,
    percent: z.percent,
  }));
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('rideAnalytics.powerProfile')}</Text>
      <Text style={styles.caption}>
        {t('rideAnalytics.powerProfileCaption', {ftp: ftpWatts, zone: `Z${dominant.zone}`, name: dominant.name})}
      </Text>
      <ZoneBars
        items={items}
        barColor={item => (item.key === dominantKey ? theme.colors.accent : BAR_TONE)}
        emphasizeKeys={[dominantKey]}
        testIdPrefix="power-zone"
      />
    </View>
  );
};

const styles = makeStyles(theme => ({
  section: {marginBottom: theme.spacing[24]},
  sectionTitle: {
    fontSize: theme.typography.fontSize.xxl,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: theme.spacing[8],
    marginTop: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
  },
  caption: {
    fontSize: theme.typography.fontSize.md,
    color: 'rgba(255, 255, 255, 0.45)',
    paddingHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[20],
  },
}));
