import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {Activity} from '../types/activity';

interface StatsCardProps {
  activities: Activity[];
}

export const StatsCard: React.FC<StatsCardProps> = ({activities}) => {
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
          <Text style={styles.statLabel}>Total distance</Text>
          <Text style={styles.statValue}>{stats.totalDistance.toFixed(0)}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Elevation gain</Text>
          <Text style={styles.statValue}>{stats.totalElevation.toFixed(0)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Moving time</Text>
          <Text style={styles.statValue}>{stats.totalTime.toFixed(1)}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Avg. Speed</Text>
          <Text style={styles.statValue}>{stats.avgSpeed.toFixed(1)}</Text>
        </View>
      </View>

      
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 12
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    width: '100%',
    borderRadius: 0,
    padding: 0,
    paddingVertical: 16,
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 10,
    color: '#888',
    marginBottom: 8,
    textAlign: 'left',
  },
  statValue: {
    fontSize: 24,
  
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  statUnit: {
    fontSize: 10,
    color: '#666',
  },
});

