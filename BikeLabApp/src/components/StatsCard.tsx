import React from 'react';
import {View, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {Activity} from '../types/activity';
import {makeStyles, withOpacity} from '../theme';

interface StatsCardProps {
  activities: Activity[];
}

export const StatsCard: React.FC<StatsCardProps> = ({activities}) => {
  const {t} = useTranslation();
  const calculateStats = () => {
    if (activities.length === 0) {
      return {
        totalDistance: 0,
        totalElevation: 0,
        totalTime: 0,
        avgSpeed: 0,
      };
    }

    const totalDistance = activities.reduce(
      (sum, a) => sum + (a.distance || 0),
      0,
    );
    const totalElevation = activities.reduce(
      (sum, a) => sum + (a.total_elevation_gain || 0),
      0,
    );
    const totalTime = activities.reduce(
      (sum, a) => sum + (a.moving_time || 0),
      0,
    );
    const avgSpeed = totalTime > 0 ? (totalDistance / totalTime) * 3.6 : 0;

    return {
      totalDistance: totalDistance / 1000, // km
      totalElevation, // m
      totalTime: totalTime / 3600, // hours
      avgSpeed, // km/h
    };
  };

  const stats = calculateStats();

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{t('stats.totalDistance')}</Text>
          <Text style={styles.statValue}>{stats.totalDistance.toFixed(0)}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{t('stats.elevationGain')}</Text>
          <Text style={styles.statValue}>{stats.totalElevation.toFixed(0)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{t('stats.movingTime')}</Text>
          <Text style={styles.statValue}>{stats.totalTime.toFixed(1)}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{t('stats.avgSpeed')}</Text>
          <Text style={styles.statValue}>{stats.avgSpeed.toFixed(1)}</Text>
        </View>
      </View>


    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    paddingHorizontal: theme.spacing[16],
    marginBottom: 0,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing[8],
    marginBottom: theme.spacing[8],
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    width: '100%',
    borderRadius: theme.radii.none,
    padding: 0,
    paddingVertical: theme.spacing[24],
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: theme.typography.fontSize.md,
    color: withOpacity(theme.colors.black, 0.5),
    marginBottom: theme.spacing[8],
    textAlign: 'left',
  },
  statValue: {
    fontSize: theme.typography.fontSize.xxxl,
    fontWeight: theme.typography.fontWeight.black,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  statUnit: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.secondary,
  },
}));
