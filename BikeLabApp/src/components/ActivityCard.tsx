import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {getDateLocale} from '../i18n/dateLocale';
import type {Activity} from '../types/activity';
import {makeStyles} from '../theme';

interface ActivityCardProps {
  activity: Activity;
  onPress?: () => void;
  onAIAnalysisPress?: (activityId: number, activityName: string) => void;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  onPress,
  onAIAnalysisPress,
}) => {
  const {t} = useTranslation();
  const formatDistance = (meters: number): string => {
    return (meters / 1000).toFixed(2) + ' km';
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.activityName} numberOfLines={1}>
          {activity.name}
          <Text style={styles.activityDate}>  {formatDate(activity.start_date)}</Text>
        </Text>
        <TouchableOpacity
          style={styles.aiButton}
          onPress={(e) => {
            e.stopPropagation(); // предотвращаем открытие модалки деталей
            if (onAIAnalysisPress) {
              onAIAnalysisPress(activity.id, activity.name);
            }
          }}
          activeOpacity={0.7}>
          <Text style={styles.aiButtonText}>{t('activityCard.aiAnalytic')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardStats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{t('activityCard.distance')}</Text>
          <Text style={styles.statValue}>
            {formatDistance(activity.distance)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{t('activityCard.time')}</Text>
          <Text style={styles.statValue}>
            {formatDuration(activity.moving_time)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{t('activityCard.elevation')}</Text>
          <Text style={styles.statValue}>
            {activity.total_elevation_gain}m
          </Text>
        </View>
      </View>


    </TouchableOpacity>
  );
};

const styles = makeStyles(theme => ({
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[16],
    paddingBottom: theme.spacing[8],
    marginHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[8],
    ...theme.shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[24],
  },
  activityName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    flex: 1,
    marginRight: theme.spacing[8],
  },
  aiButton: {
    backgroundColor: theme.colors.accentSurface,
    paddingHorizontal: theme.spacing[10],
    paddingVertical: theme.spacing[6],
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentSurfaceBorder,
  },
  aiButtonText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.accent,
    fontWeight: theme.typography.fontWeight.medium,
    letterSpacing: theme.typography.letterSpacing.wide,
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[8],
    marginTop: theme.spacing[4],
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[4],
  },
  statValue: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  activityDate: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.muted,
    marginTop: theme.spacing[4],
    marginLeft: theme.spacing[4],
  },
}));
