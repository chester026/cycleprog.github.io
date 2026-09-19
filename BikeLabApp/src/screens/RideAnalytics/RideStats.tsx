// Extracted from RideAnalyticsScreen.tsx (T-5.4 screen decomposition):
// the ride-quality hero block, the HR-zone distribution bars and the
// "Impact on Goals" card row. Pixel-identical to the original inline JSX.
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { makeStyles } from '../../theme';
import { rideQualityColor } from './lib';
import type { RideQuality } from './lib';
import type { Activity } from '../../types/activity';
import type { HrZoneBucket } from './lib';
import type { ActivityMetaGoalProgress } from '../../data/hooks/useActivityMetaGoalsProgress';

interface RideStatsProps {
  activity: Activity;
  rideDate: string;
  rideQuality: RideQuality | null;
  hrZoneDistribution: HrZoneBucket[];
  metaGoals: ActivityMetaGoalProgress[];
  /** Rendered between the title block and HR zones — the mini stream charts
   *  live there in the original layout (charts → zones → goals). */
  chartsSlot?: React.ReactNode;
}

export const RideStats: React.FC<RideStatsProps> = ({
  activity,
  rideDate,
  rideQuality,
  hrZoneDistribution,
  metaGoals,
  chartsSlot,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Ride Quality + Title */}
      <View style={styles.rideScoreSection}>
        {rideQuality !== null && (
          <View style={styles.rideScoreBlock}>
            <View style={styles.rideScoreHeaderRow}>
              <View
                style={[
                  styles.rideScoreDot,
                  { backgroundColor: rideQualityColor(rideQuality.quality) },
                ]}
              />
              <Text
                style={[
                  styles.rideScoreHeaderText,
                  { color: rideQualityColor(rideQuality.quality) },
                ]}
              >
                {rideQuality.label}
              </Text>
            </View>
            <Text style={styles.rideScoreNumber}>
              {t('rideAnalytics.rideQuality')}
              {rideQuality.quality}
              <Text style={styles.rideScoreOf}>{t('rideAnalytics.of100')}</Text>
            </Text>
            <Text style={styles.rideQualityHeaderAdvice}>
              {rideQuality.advice}
            </Text>
          </View>
        )}
        <Text style={styles.rideTitle}>{activity.name}</Text>
        <Text style={styles.rideDate}>{rideDate}</Text>
      </View>

      {chartsSlot}

      {/* HR Zone Distribution - Bar Charts */}
      {hrZoneDistribution.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('rideAnalytics.hrZones')}</Text>
          <View style={styles.hrZoneBarList}>
            {hrZoneDistribution.map(z => (
              <View key={z.zone} style={styles.hrZoneBarRow}>
                <Text style={styles.hrZoneBarLabel}>
                  {z.zone} {z.rangeMin}-{z.rangeMax}
                </Text>
                <View style={styles.hrZoneBarTrack}>
                  <View
                    style={[
                      styles.hrZoneBarFill,
                      {
                        width: `${Math.max(z.percent, 2)}%`,
                        backgroundColor: z.color,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.hrZoneBarPercent}>{z.percent}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Impact on Goals */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t('rideAnalytics.impactOnGoals')}
        </Text>
        {metaGoals.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scrollViewContainer}
          >
            {metaGoals.map(goal => (
              <View key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalTitle} numberOfLines={1}>
                    {goal.title}
                  </Text>
                </View>
                <View style={styles.goalStatsRow}>
                  <Text style={styles.goalProgressLarge}>{goal.progress}%</Text>
                  {(goal.progressGain ?? 0) > 0 && (
                    <View style={styles.goalBadge}>
                      <Text style={styles.goalBadgeText}>
                        +{goal.progressGain}%
                      </Text>
                    </View>
                  )}
                </View>
                {goal.contributions && goal.contributions.length > 0 ? <View style={styles.contributionsContainer}>
                    {goal.contributions.map((contrib, idx) => (
                      <View key={idx} style={styles.contributionItem}>
                        <Text style={styles.contributionLabel}>
                          {contrib.label}:
                        </Text>
                        <Text style={styles.contributionValue}>
                          {contrib.value}
                        </Text>
                      </View>
                    ))}
                  </View> : null}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>
              {t('rideAnalytics.noActiveGoals')}
            </Text>
          </View>
        )}
      </View>
    </>
  );
};

const styles = makeStyles(theme => ({
  rideScoreSection: {
    paddingHorizontal: theme.spacing[16],
    paddingTop: 28,
    paddingBottom: theme.spacing[16],
  },
  rideScoreBlock: {
    marginBottom: theme.spacing[32],
  },
  rideScoreHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
    marginBottom: theme.spacing[4],
  },
  rideScoreDot: {
    width: theme.spacing[12],
    height: theme.spacing[12],
    borderRadius: 20,
  },
  rideScoreHeaderText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rideScoreNumber: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  rideScoreOf: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(255, 255, 255, 0.2)',
  },
  rideQualityHeaderAdvice: {
    fontSize: theme.typography.fontSize.base,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: theme.spacing[6],
  },
  rideTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: theme.spacing[4],
  },
  rideDate: {
    fontSize: theme.typography.fontSize.md,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  section: {
    marginBottom: theme.spacing[24],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xxl,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: theme.spacing[8],
    marginTop: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
  },
  placeholderBox: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[20],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  placeholderText: {
    color: '#666',
    fontSize: theme.typography.fontSize.lg,
  },
  hrZoneBarList: {
    paddingHorizontal: theme.spacing[16],
    marginTop: theme.spacing[24],
    marginBottom: theme.spacing[16],
    gap: theme.spacing[10],
  },
  hrZoneBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
  },
  hrZoneBarLabel: {
    width: 70,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  hrZoneBarTrack: {
    flex: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderRadius: 0,
    overflow: 'hidden',
  },
  hrZoneBarFill: {
    height: '100%',
    borderRadius: 0,
  },
  hrZoneBarPercent: {
    width: 36,
    fontSize: theme.typography.fontSize.base,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  scrollViewContainer: {
    flexDirection: 'row',
    gap: theme.spacing[8],
    paddingLeft: theme.spacing[16],
  },
  goalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: theme.spacing[16],
    marginBottom: theme.spacing[12],
    marginTop: theme.spacing[16],
    borderRadius: theme.radii.md,
    width: 212,
    height: 180,
    marginRight: theme.spacing[8],
    justifyContent: 'space-between',
  },
  goalHeader: {
    marginBottom: theme.spacing[8],
  },
  goalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  goalStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    marginBottom: theme.spacing[12],
  },
  goalProgressLarge: {
    fontSize: 30,
    fontWeight: '900',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  goalBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.spacing[4],
  },
  goalBadgeText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.success,
  },
  contributionsContainer: {
    gap: theme.spacing[8],
  },
  contributionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
  },
  contributionLabel: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.muted,
    fontWeight: theme.typography.fontWeight.medium,
  },
  contributionValue: {
    fontSize: theme.typography.fontSize.md,
    color: 'rgb(21, 143, 102)',
    fontWeight: theme.typography.fontWeight.bold,
  },
}));
