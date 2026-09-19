// Horizontally-scrolling row of "Bike garage" widgets: the primary-bike
// card, the best-avg-speed chart, and the power/HR/cadence/VO2max
// snapshot cards. Extracted from GarageScreen.tsx (T-5.4, audit A-27).
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Bike } from '@bikelab/shared/types';
import type { AnalyticsSnapshot } from '@bikelab/shared/types';
import type { MetricTrend } from '@bikelab/shared/calc';
import type { Activity } from '../../types/activity';
import { TrendBadge } from '../../components/TrendBadge';
import { BikesWidget } from '../../components/BikesWidget';
import { BestAvgSpeedWidget } from '../../components/BestAvgSpeedWidget';
import { makeStyles } from '../../theme';

export interface SnapshotWidgetsProps {
  bikes: Bike[];
  activities: Activity[];
  snapshot: AnalyticsSnapshot | null;
  metricsTrend: MetricTrend | null;
}

export const SnapshotWidgets: React.FC<SnapshotWidgetsProps> = ({
  bikes,
  activities,
  snapshot,
  metricsTrend,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* "Bike garage" title sits above the widget row, photos come after
        (GarageGallery) — same order as the original screen. */}
      <View style={styles.garageHeader}>
        <Text style={styles.garageTitle}>{t('garage.bikeGarage')}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.widgetsScrollView}
        contentContainerStyle={styles.widgetsContainer}
      >
        <BikesWidget bikes={bikes} />
        <BestAvgSpeedWidget activities={activities} />
        {snapshot ? <View style={styles.snapshotGrid}>
            {snapshot.avg_power != null && (
              <View style={styles.snapshotCard}>
                <View style={styles.snapshotCardLabelRow}>
                  <Text style={styles.snapshotCardLabel}>
                    {t('garage.avgPower')}
                  </Text>
                  <TrendBadge value={metricsTrend?.avg_power} />
                </View>
                <View style={styles.snapshotCardBottom}>
                  <Text style={styles.snapshotCardValue}>
                    {Math.round(Number(snapshot.avg_power))}
                  </Text>
                  <Text style={styles.snapshotCardUnit}>
                    {t('common.watts')}
                  </Text>
                </View>
                {snapshot.max_power != null && (
                  <Text style={styles.snapshotCardSub}>
                    {t('garage.maxPrefix')} {Math.round(Number(snapshot.max_power))}
                  </Text>
                )}
              </View>
            )}
            {snapshot.avg_hr != null && (
              <View style={styles.snapshotCard}>
                <View style={styles.snapshotCardLabelRow}>
                  <Text style={styles.snapshotCardLabel}>
                    {t('garage.avgHR')}
                  </Text>
                  <TrendBadge value={metricsTrend?.avg_hr} />
                </View>
                <View style={styles.snapshotCardBottom}>
                  <Text style={styles.snapshotCardValue}>
                    {Math.round(Number(snapshot.avg_hr))}
                  </Text>
                  <Text style={styles.snapshotCardUnit}>{t('common.bpm')}</Text>
                </View>
                {snapshot.max_hr != null && (
                  <Text style={styles.snapshotCardSub}>
                    {t('garage.maxPrefix')} {Math.round(Number(snapshot.max_hr))}
                  </Text>
                )}
              </View>
            )}
            {snapshot.avg_cadence != null && (
              <View style={styles.snapshotCard}>
                <View style={styles.snapshotCardLabelRow}>
                  <Text style={styles.snapshotCardLabel}>
                    {t('garage.avgCadence')}
                  </Text>
                  <TrendBadge value={metricsTrend?.avg_cadence} />
                </View>
                <View style={styles.snapshotCardBottom}>
                  <Text style={styles.snapshotCardValue}>
                    {Math.round(Number(snapshot.avg_cadence))}
                  </Text>
                  <Text style={styles.snapshotCardUnit}>{t('common.rpm')}</Text>
                </View>
                {snapshot.max_cadence != null && (
                  <Text style={styles.snapshotCardSub}>
                    {t('garage.maxPrefix')} {Math.round(Number(snapshot.max_cadence))}
                  </Text>
                )}
              </View>
            )}
            {snapshot.vo2max != null && (
              <View style={styles.snapshotCard}>
                <Text style={styles.snapshotCardLabel}>{t('vo2max.sectionTitle')}</Text>
                <Text style={styles.snapshotCardValue}>
                  {Math.round(Number(snapshot.vo2max))}
                </Text>
                <Text style={styles.snapshotCardSub}>{t('vo2max.unit')}</Text>
              </View>
            )}
          </View> : null}
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
  widgetsScrollView: {
    marginBottom: 0,
  },
  widgetsContainer: {
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[8],
  },
  snapshotGrid: {
    width: 324,
    height: 270,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
    marginRight: theme.spacing[8],
  },
  snapshotCard: {
    width: 158,
    height: 131,
    backgroundColor: '#f1f0f0',
    padding: theme.spacing[12],
    justifyContent: 'space-between',
    borderRadius: theme.radii.md,
  },
  snapshotCardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[8],
  },
  snapshotCardLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.muted,
    fontWeight: '500', // not in the typography scale yet — kept literal
  },
  snapshotCardBottom: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing[8],
  },
  snapshotCardValue: {
    fontSize: 32,
    fontWeight: theme.typography.fontWeight.black,
    color: theme.colors.text.primary,
  },
  snapshotCardUnit: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.muted,
  },
  snapshotCardSub: {
    fontSize: theme.typography.fontSize.sm,
    color: '#aaa',
    marginTop: theme.spacing[6],
  },
}));
