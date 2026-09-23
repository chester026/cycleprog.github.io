// Extracted from BikeGarageScreen.tsx (screen decomposition, T-5.5 /
// GUIDE-5b). Only rendered by the screen when `nextService.inKm > 0`.
import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, withOpacity} from '../../theme';
import type {BikeHealth} from './types';

interface NextServiceBannerProps {
  nextService: BikeHealth['nextService'];
}

export const NextServiceBanner: React.FC<NextServiceBannerProps> = ({nextService}) => {
  const {t} = useTranslation();
  return (
    <View style={styles.nextSvcBanner}>
      <View style={styles.nextSvcLeft}>
        <Text style={styles.nextSvcLabel}>{t('bikeGarage.nextService')}</Text>
        <Text style={styles.nextSvcComp}>{t(`bikeGarage.comp_${nextService.component}`)}</Text>
      </View>
      <View style={styles.nextSvcRight}>
        <Text style={styles.nextSvcValue}>{nextService.inKm.toLocaleString()}</Text>
        <Text style={styles.nextSvcUnit}>{t('common.km')}</Text>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  nextSvcBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.text.primary,
    paddingHorizontal: theme.spacing[20],
    paddingVertical: theme.spacing[12],
    marginTop: 0,
    marginBottom: theme.spacing[24],
    borderRadius: theme.radii.lg,
  },
  nextSvcLeft: {flex: 1},
  nextSvcLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: withOpacity(theme.colors.text.inverse, 0.5),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing[4],
  },
  nextSvcComp: {fontSize: theme.typography.fontSize.xl, fontWeight: '700', color: theme.colors.text.inverse},
  nextSvcRight: {flexDirection: 'row', alignItems: 'baseline', gap: 3},
  nextSvcValue: {fontSize: 28, fontWeight: '800', color: theme.colors.text.inverse, letterSpacing: -1},
  nextSvcUnit: {fontSize: theme.typography.fontSize.base, fontWeight: '600', color: withOpacity(theme.colors.text.inverse, 0.5)},
}));
