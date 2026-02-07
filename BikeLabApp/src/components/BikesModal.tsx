/**
 * BikesModal - Modal showing all user bikes
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Bike {
  id: string;
  name: string;
  brand_name?: string;
  model_name?: string;
  primary: boolean;
  distanceKm: number;
  activitiesCount: number;
}

interface BikesModalProps {
  visible: boolean;
  onClose: () => void;
  bikes: Bike[];
}

export const BikesModal: React.FC<BikesModalProps> = ({
  visible,
  onClose,
  bikes,
}) => {
  const getBikeName = (bike: Bike) => {
    if (bike.brand_name && bike.model_name) {
      return `${bike.brand_name} ${bike.model_name}`;
    }
    return bike.name;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Bikes</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Bikes List */}
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {bikes.map((bike, index) => (
            <View key={bike.id} style={styles.bikeCard}>
              {/* Primary Badge */}
              {bike.primary && (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>Primary</Text>
                </View>
              )}

              {/* Bike Name */}
              <Text style={styles.bikeName}>{getBikeName(bike)}</Text>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {bike.distanceKm.toLocaleString()}
                  </Text>
                  <Text style={styles.statLabel}>km</Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{bike.activitiesCount}</Text>
                  <Text style={styles.statLabel}>rides</Text>
                </View>
              </View>
            </View>
          ))}

          {bikes.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No bikes added yet</Text>
              <Text style={styles.emptySubtext}>
                Add bikes in Strava to see them here
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#274dd3',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  bikeCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 0,
  },
  primaryBadge: {
    backgroundColor: '#274dd3',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  primaryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  bikeName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#ddd',
    marginHorizontal: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
});
