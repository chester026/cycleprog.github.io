// Heart-rate zones of one ride as vertical bars, in shades of red: the
// zone with the biggest share is full red, every next zone (by share, not
// by zone number) a step paler (owner, 30.10.2026 — same picture as the
// power profile, instead of the five-colour horizontal bars).
import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {HrZoneBucket} from '@bikelab/shared/calc';
import {makeStyles, useTheme, withOpacity} from '../../theme';
import {ZoneBars, rankByPercent} from './ZoneBars';

interface HrZoneBarsProps {
  zones: HrZoneBucket[];
}

// Opacity of the red by rank: 0 = dominant zone … 4 = smallest share.
export const HR_RANK_OPACITY = [1, 0.62, 0.4, 0.26, 0.16];

export const HrZoneBars: React.FC<HrZoneBarsProps> = ({zones}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const items = zones.map(z => ({
    key: z.zone,
    label: z.zone,
    sublabel: `${z.rangeMin}–${z.rangeMax}`,
    percent: z.percent,
  }));
  const ranks = rankByPercent(items);
  const dominant = items.find(it => ranks.get(it.key) === 0);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('rideAnalytics.hrZones')}</Text>
      <ZoneBars
        items={items}
        barColor={(_item, rank) =>
          withOpacity(theme.colors.danger, HR_RANK_OPACITY[Math.min(rank, HR_RANK_OPACITY.length - 1)])
        }
        emphasizeKeys={dominant ? [dominant.key] : []}
        testIdPrefix="hr-zone"
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
    marginBottom: theme.spacing[20],
    marginTop: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
  },
}));
