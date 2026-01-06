import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import type {Activity} from '../types/activity';

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
    return date.toLocaleDateString('en-US', {
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
          <Text style={styles.aiButtonText}>AI Analytic</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardStats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>
            {formatDistance(activity.distance)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Time</Text>
          <Text style={styles.statValue}>
            {formatDuration(activity.moving_time)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Elevation</Text>
          <Text style={styles.statValue}>
            {activity.total_elevation_gain}m
          </Text>
        </View>
      </View>

     
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#ededed',
    padding: 16,
    paddingBottom: 8,
    marginHorizontal: 8,
    marginBottom: 8
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  activityName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 8,
  },
  aiButton: {
    backgroundColor: 'rgba(39, 77, 211, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(39, 77, 211, 0.1)',
  },
  aiButtonText: {
    fontSize: 10,
    color: '#274dd3',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 4,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  activityDate: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    marginLeft: 4
  },
});

