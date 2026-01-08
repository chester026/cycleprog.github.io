import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import type {Activity} from '../types/activity';

interface ActivityDetailsModalProps {
  activity: Activity | null;
  visible: boolean;
  onClose: () => void;
}

export const ActivityDetailsModal: React.FC<ActivityDetailsModalProps> = ({
  activity,
  visible,
  onClose,
}) => {
  if (!activity) return null;

  const formatDistance = (meters: number): string => {
    return (meters / 1000).toFixed(2) + ' km';
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSpeed = (metersPerSecond: number): string => {
    return (metersPerSecond * 3.6).toFixed(1) + ' km/h';
  };

  const formatMinutes = (seconds: number): string => {
    return Math.round(seconds / 60) + ' min';
  };

  // Вычисляем Est. Power на основе физических параметров
  const calculateEstimatedPower = (): number | null => {
    // Если есть реальная мощность, не показываем расчетную
    if (activity.average_watts) return null;
    
    // Базовый расчет на основе скорости, веса, подъема
    const speedKmh = activity.average_speed * 3.6;
    const elevPerKm = (activity.total_elevation_gain / (activity.distance / 1000));
    
    // Упрощенная формула: Power ≈ speed * (weight + elevation factor)
    const basePower = speedKmh * (5 + elevPerKm * 0.5);
    
    return Math.round(basePower);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {activity.name}
          </Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
         

          {/* Date */}
          <Text style={styles.date}>{formatDate(activity.start_date)}</Text>

          {/* Main Stats */}
          <View style={styles.statsGrid}>
            {/* Distance */}
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Distance</Text>
              <Text style={styles.statValue}>
                {formatDistance(activity.distance)}
              </Text>
            </View>

            {/* Moving Time */}
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Mov. Time</Text>
              <Text style={styles.statValue}>
                {formatMinutes(activity.moving_time)}
              </Text>
            </View>

            {/* Elapsed Time */}
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Elap. Time</Text>
              <Text style={styles.statValue}>
                {formatMinutes(activity.elapsed_time)}
              </Text>
            </View>

            {/* Average Speed */}
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg. Speed</Text>
              <Text style={styles.statValue}>
                {formatSpeed(activity.average_speed)}
              </Text>
            </View>

            {/* Max Speed */}
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Max Speed</Text>
              <Text style={styles.statValue}>
                {formatSpeed(activity.max_speed)}
              </Text>
            </View>

            {/* Elevation Gain */}
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Elev. Gain</Text>
              <Text style={styles.statValue}>
                {activity.total_elevation_gain}m
              </Text>
            </View>

            {/* Max Elevation */}
            {activity.elev_high !== undefined && (
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Max Elevation</Text>
                <Text style={styles.statValue}>{activity.elev_high}m</Text>
              </View>
            )}

            {/* Average Heartrate */}
            {activity.average_heartrate !== undefined && (
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Avg. Heartrate</Text>
                <Text style={styles.statValue}>
                  {Math.round(activity.average_heartrate)} bpm
                </Text>
              </View>
            )}

            {/* Max Heartrate */}
            {activity.max_heartrate !== undefined && (
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Max Heartrate</Text>
                <Text style={styles.statValue}>
                  {Math.round(activity.max_heartrate)} bpm
                </Text>
              </View>
            )}

            {/* Average Cadence */}
            {activity.average_cadence !== undefined && (
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Avg. Cadence</Text>
                <Text style={styles.statValue}>
                  {Math.round(activity.average_cadence)} rpm
                </Text>
              </View>
            )}

            {/* Temperature */}
            {activity.average_temp !== undefined && (
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Temp</Text>
                <Text style={styles.statValue}>{activity.average_temp}°C</Text>
              </View>
            )}

            {/* Estimated Power (если нет реальной мощности) */}
            {calculateEstimatedPower() !== null && (
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Est. Power</Text>
                <Text style={styles.statValue}>
                  {calculateEstimatedPower()}W
                </Text>
              </View>
            )}

            {/* Real Average Power */}
            {activity.average_watts !== undefined && activity.average_watts > 0 && (
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Real Avg Power</Text>
                <Text style={styles.statValue}>
                  {Math.round(activity.average_watts)}W
                </Text>
              </View>
            )}

            {/* Real Max Power */}
            {activity.max_watts !== undefined && activity.max_watts > 0 ? (
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Real Max Power</Text>
                <Text style={styles.statValue}>
                  {Math.round(activity.max_watts)}W
                </Text>
              </View>
            ) : activity.average_watts !== undefined && activity.average_watts > 0 ? (
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Real Max Power</Text>
                <Text style={styles.statValue}>-</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    marginRight: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#888',
    fontWeight: '300',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  
  typeBadgeText: {
    fontSize: 14,
    color: '#FF5E00',
    fontWeight: '600',
  },
  date: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 40,
  },
  statCard: {
    width: '47.5%',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});

