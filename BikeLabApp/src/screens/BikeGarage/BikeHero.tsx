// Extracted from BikeGarageScreen.tsx (screen decomposition, T-5.5 /
// GUIDE-5b): the bike name + primary badge + distance/rides stat row.
import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {Bike} from '@bikelab/shared/types';
import {makeStyles} from '../../theme';
import {bikeDisplayName} from './lib';

interface BikeHeroProps {
  bike: Bike;
}

export const BikeHero: React.FC<BikeHeroProps> = ({bike}) => {
  const {t} = useTranslation();
  return (
    <View style={styles.hero}>
      <View style={styles.heroNameRow}>
        <Text style={styles.bikeName}>{bikeDisplayName(bike)}</Text>
        {bike.primary ? <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText}>{t('common.primary')}</Text>
          </View> : null}
      </View>
      <View style={styles.heroStats}>
        <Text style={styles.heroStatVal}>{bike.distanceKm.toLocaleString()}</Text>
        <Text style={styles.heroStatUnit}>{t('common.km')}</Text>
        <View style={styles.heroDot} />
        <Text style={styles.heroStatVal}>{bike.activitiesCount}</Text>
        <Text style={styles.heroStatUnit}>{t('common.rides')}</Text>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  hero: {marginTop: theme.spacing[16], marginBottom: theme.spacing[20]},
  heroNameRow: {flexDirection: 'row', alignItems: 'center', gap: theme.spacing[10], marginBottom: theme.spacing[6]},
  bikeName: {fontSize: 28, fontWeight: '800', color: theme.colors.text.primary, letterSpacing: -0.8, flexShrink: 1},
  primaryBadge: {backgroundColor: theme.colors.accent, paddingHorizontal: theme.spacing[10], paddingVertical: 4, borderRadius: theme.radii.pill},
  primaryBadgeText: {fontSize: 10, fontWeight: '700', color: theme.colors.text.inverse, textTransform: 'uppercase', letterSpacing: 0.5},
  heroStats: {flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing[4]},
  heroStatVal: {fontSize: 15, fontWeight: '700', color: theme.colors.text.primary},
  heroStatUnit: {fontSize: theme.typography.fontSize.base, color: theme.colors.text.iosMuted, fontWeight: '500', marginRight: theme.spacing[4]},
  heroDot: {width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.colors.separator, marginHorizontal: theme.spacing[6], marginBottom: 2},
}));
