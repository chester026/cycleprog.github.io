/**
 * BikesModal - Modal showing all user bikes
 */

import React from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {Bike} from '@bikelab/shared/types';
import {makeStyles} from '../theme';

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
  const {t} = useTranslation();
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
          <Text style={styles.headerTitle}>{t('bikes.title')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>

        {/* Bikes List */}
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {bikes.map(bike => (
            <View key={bike.id} style={styles.bikeCard}>
              {/* Primary Badge */}
              {bike.primary ? <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>{t('common.primary')}</Text>
                </View> : null}

              {/* Bike Name */}
              <Text style={styles.bikeName}>{getBikeName(bike)}</Text>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {bike.distanceKm.toLocaleString()}
                  </Text>
                  <Text style={styles.statLabel}>{t('common.km')}</Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{bike.activitiesCount}</Text>
                  <Text style={styles.statLabel}>{t('common.rides')}</Text>
                </View>
              </View>
            </View>
          ))}

          {bikes.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t('bikes.noBikes')}</Text>
              <Text style={styles.emptySubtext}>
                {t('bikes.noBikesHint')}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.hairline,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.accent,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  bikeCard: {
    backgroundColor: theme.colors.surfaceElevated,
    padding: 20,
    borderRadius: 0,
  },
  primaryBadge: {
    backgroundColor: theme.colors.accent,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  primaryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  bikeName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text.primary,
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
    color: theme.colors.text.primary,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.muted,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.bikes.statDivider,
    marginHorizontal: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.text.faint,
  },
}));
