// Power profile of one ride: seven vertical bars, one per Coggan zone,
// height = share of the ride spent in that zone (owner ask, 30.10.2026:
// "как это заведено вертикальными барами"). Only rendered when the ride
// has a power stream AND the rider has an FTP estimate (zones come from
// GET /api/analytics/power-profile); shares are computed in shared calc
// (`powerZoneDistribution`) from the same downsampled stream the mini
// charts draw.
import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {PowerZoneShare} from '@bikelab/shared/calc';
import {makeStyles, useTheme} from '../../theme';

interface PowerProfileBarsProps {
  shares: PowerZoneShare[];
  ftpWatts: number;
}

const BAR_AREA_HEIGHT = 120;

export const PowerProfileBars: React.FC<PowerProfileBarsProps> = ({shares, ftpWatts}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const maxPercent = Math.max(1, ...shares.map(z => z.percent));
  const dominant = shares.reduce((best, z) => (z.percent > best.percent ? z : best), shares[0]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('rideAnalytics.powerProfile')}</Text>
      <Text style={styles.caption}>
        {t('rideAnalytics.powerProfileCaption', {ftp: ftpWatts, zone: `Z${dominant.zone}`, name: dominant.name})}
      </Text>
      <View style={styles.bars}>
        {shares.map(z => {
          const h = Math.max(4, Math.round((z.percent / maxPercent) * BAR_AREA_HEIGHT));
          return (
            <View key={z.zone} style={styles.barCol} testID={`power-zone-${z.zone}`}>
              <Text style={styles.percent}>{z.percent > 0 ? `${z.percent}%` : ''}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, {height: h, backgroundColor: theme.colors.powerZones[z.zone - 1]}]} />
              </View>
              <Text style={styles.zoneLabel}>{`Z${z.zone}`}</Text>
              <Text style={styles.zoneRange}>{z.maxW === null ? `${z.minW}+` : `${z.maxW}`}</Text>
            </View>
          );
        })}
      </View>
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
    marginBottom: theme.spacing[16],
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing[16],
    gap: theme.spacing[8],
  },
  barCol: {flex: 1, alignItems: 'center'},
  percent: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: theme.spacing[4],
    height: 14,
  },
  barTrack: {
    width: '100%',
    height: BAR_AREA_HEIGHT,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  barFill: {width: '100%', borderRadius: 8},
  zoneLabel: {
    marginTop: theme.spacing[6],
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  zoneRange: {fontSize: 10, color: 'rgba(255, 255, 255, 0.35)'},
}));
