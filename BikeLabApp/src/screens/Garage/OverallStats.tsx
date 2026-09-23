// "Overall" totals row — tapping any card opens the full activity history.
// Extracted from GarageScreen.tsx (T-5.4, audit A-27).
import React from 'react';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useAppNavigation} from '../../navigation/hooks';
import {makeStyles} from '../../theme';
import type {OverallStats as OverallStatsData} from './lib';

export interface OverallStatsProps {
  stats: OverallStatsData;
}

export const OverallStats: React.FC<OverallStatsProps> = ({stats}) => {
  const {t} = useTranslation();
  const navigation = useAppNavigation();
  const goToActivities = () => navigation.navigate('Activities');

  return (
    <>
      <View style={styles.garageHeader}>
        {/* Reuses skills.overall ("Overall") — same string, no new i18n key needed. */}
        <Text style={styles.garageTitle}>{t('skills.overall')}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.overallScrollContent}>
        <TouchableOpacity style={styles.overallCardBig} activeOpacity={0.7} onPress={goToActivities}>
          <View style={styles.overallCardTop}>
            <Text style={styles.overallCardLabel}>{t('stats.totalDistance')}</Text>
            <Text style={styles.overallCardUnit}>{t('common.km')}</Text>
          </View>
          <Text style={styles.overallCardValue}>{stats.totalDistance.toFixed(0)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.overallCardBig} activeOpacity={0.7} onPress={goToActivities}>
          <View style={styles.overallCardTop}>
            <Text style={styles.overallCardLabel}>{t('stats.elevationGain')}</Text>
            <Text style={styles.overallCardUnit}>m</Text>
          </View>
          <Text style={styles.overallCardValue}>{stats.totalElevation.toFixed(0)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.overallCardBig} activeOpacity={0.7} onPress={goToActivities}>
          <View style={styles.overallCardTop}>
            <Text style={styles.overallCardLabel}>{t('stats.avgSpeed')}</Text>
            <Text style={styles.overallCardUnit}>{t('common.kmh')}</Text>
          </View>
          <Text style={styles.overallCardValue}>{stats.avgSpeed.toFixed(1)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.overallCardBig} activeOpacity={0.7} onPress={goToActivities}>
          <View style={styles.overallCardTop}>
            <Text style={styles.overallCardLabel}>{t('stats.movingTime')}</Text>
            <Text style={styles.overallCardUnit}>{t('common.hours')}</Text>
          </View>
          <Text style={styles.overallCardValue}>{stats.totalTime.toFixed(1)}</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
};

const styles = makeStyles(theme => ({
  garageHeader: {
    padding: theme.spacing[16],
  },
  garageTitle: {
    fontSize: 52,
    fontWeight: theme.typography.fontWeight.black,
    opacity: 0.2,
    textTransform: 'uppercase',
    color: theme.colors.text.primary,
    marginTop: theme.spacing[16],
  },
  overallScrollContent: {
    flexDirection: 'row',
    gap: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[4],
    marginBottom: theme.spacing[8],
  },
  overallCardBig: {
    width: 170,
    minHeight: 145,
    backgroundColor: theme.colors.speedWidget.cardBg,
    padding: theme.spacing[18],
    borderRadius: 24,
    justifyContent: 'space-between',
  },
  overallCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 0,
  },
  overallCardLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(0, 0, 0, 0.5)',
    flexShrink: 1,
    lineHeight: 20,
  },
  overallCardValue: {
    fontSize: 32,
    fontWeight: theme.typography.fontWeight.black,
    color: theme.colors.text.primary,
  },
  overallCardUnit: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.faint,
    marginTop: theme.spacing[2],
  },
}));
