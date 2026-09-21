// Extracted from RideAnalyticsScreen.tsx (T-5.4 screen decomposition):
// the ride-quality hero block, the HR-zone distribution bars and the
// "Impact on Goals" card row. Pixel-identical to the original inline JSX.
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ProgressRing } from '../../components/coach/ProgressRing';
import { useTranslation } from 'react-i18next';
import { TIER_CONFIG } from '@bikelab/shared/constants';
import { makeStyles } from '../../theme';
import { rideQualityColor } from './lib';
import type { RideQuality } from './lib';
import type { Activity } from '../../types/activity';
import type { HrZoneBucket } from './lib';
import type { ActivityMetaGoalProgress } from '../../data/hooks/useActivityMetaGoalsProgress';

// Every goal this ride touched gets a card, but a goal can have six
// sub-goals and six "+0.2 W" rows are a wall of numbers, not an insight.
// Three rows, then the card offers the full picture on the goal's screen.
const MAX_CONTRIBUTIONS = 3;

interface RideStatsProps {
  activity: Activity;
  rideDate: string;
  rideQuality: RideQuality | null;
  hrZoneDistribution: HrZoneBucket[];
  metaGoals: ActivityMetaGoalProgress[];
  /** Rendered between the title block and HR zones — the mini stream charts
   *  live there in the original layout (charts → zones → goals). */
  chartsSlot?: React.ReactNode;
  /** Opens one goal's detail screen — from the card, or its "check more" row. */
  onOpenGoal: (goalId: number | string) => void;
}

export const RideStats: React.FC<RideStatsProps> = ({
  activity,
  rideDate,
  rideQuality,
  hrZoneDistribution,
  metaGoals,
  chartsSlot,
  onOpenGoal,
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
          <View style={styles.goalList}>
            {metaGoals.map(goal => {
              const hiddenContributions = Math.max(
                0,
                (goal.contributions?.length ?? 0) - MAX_CONTRIBUTIONS,
              );
              return (
              <TouchableOpacity
                key={goal.id}
                style={styles.goalCard}
                activeOpacity={0.7}
                onPress={() => onOpenGoal(goal.id)}>
                {/* Ring left, title right — the same reading order as the
                    goals list's MetaGoalCard, so the two feel like one
                    component in two themes. `gradientId` must be unique
                    among mounted rings (SVG defs aren't scoped). */}
                <View style={styles.goalHeader}>
                  <ProgressRing
                    size={50}
                    strokeWidth={4.5}
                    value={goal.progress}
                    // Muted grey rather than the brand blue: three of these
                    // rings stacked made the block read as a wall of blue,
                    // and here the ring is context, not the headline.
                    // Opaque greys on purpose - react-native-svg's <Stop>
                    // ignores the alpha channel of an rgba() stopColor, so
                    // translucent white renders as solid white.
                    colors={['rgb(121, 121, 121)', 'rgb(121, 121, 121)']}
                    gradientId={`rideGoalRing-${goal.id}`}
                    trackColor="rgb(63, 63, 63)">
                    <Text style={styles.goalRingPercent}>{goal.progress}%</Text>
                  </ProgressRing>
                  <Text style={styles.goalTitle} numberOfLines={2}>
                    {goal.title}
                  </Text>
                  {(goal.progressGain ?? 0) > 0 && (
                    <View style={styles.goalBadge}>
                      <Text style={styles.goalBadgeText}>+{goal.progressGain}%</Text>
                    </View>
                  )}
                </View>
                {goal.contributions && goal.contributions.length > 0 ? (
                  <View style={styles.contributionsContainer}>
                    {goal.contributions.slice(0, MAX_CONTRIBUTIONS).map((contrib, idx) => (
                      <View key={idx} style={styles.contributionItem}>
                        {/* The label is a sub-goal title ("Sustained Climbing
                            Power") — it takes whatever room the value leaves
                            and truncates, instead of pushing the value out
                            of the card. */}
                        <Text style={styles.contributionLabel} numberOfLines={1}>
                          {contrib.label}
                        </Text>
                        <Text style={styles.contributionValue}>{contrib.value}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Footer, same idea as the goals list card: what kind of
                    goal this is on the left, the way into it on the right. */}
                <View style={styles.cardFooter}>
                  {(() => {
                    const tier = goal.tier || 'base';
                    const tierCfg = TIER_CONFIG[tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.base;
                    const isBase = tier === 'base';
                    return (
                      <View
                        style={[
                          styles.tierBadge,
                          isBase ? styles.tierBadgeBase : {backgroundColor: tierCfg.color},
                        ]}>
                        <Text style={[styles.tierBadgeText, isBase && styles.tierBadgeTextBase]}>
                          {t(tierCfg.key)}
                        </Text>
                      </View>
                    );
                  })()}

                  {hiddenContributions > 0 && (
                    <View style={styles.cardMoreRow}>
                      <Text style={styles.cardMoreText}>
                        {t('rideAnalytics.moreContributions', {count: hiddenContributions})}
                      </Text>
                      <Text style={styles.cardMoreChevron}>›</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              );
            })}
          </View>
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
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderRadius: 100,
    overflow: 'hidden',
  },
  hrZoneBarFill: {
    height: '100%',
    borderRadius: 100,
  },
  hrZoneBarPercent: {
    width: 36,
    fontSize: theme.typography.fontSize.base,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  // Full-width cards stacked down the screen, not a horizontal strip of
  // fixed 212×180 boxes: a contribution row is now a sub-goal's real title
  // plus its value, and there can be six of them, so neither the width nor
  // the height can be pinned any more.
  goalList: {
    paddingHorizontal: theme.spacing[16],
    marginTop: theme.spacing[16],
    gap: theme.spacing[12],
  },
  goalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: theme.spacing[16],
    borderRadius: theme.radii.md,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing[14],
  },
  tierBadge: {
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radii.pill,
  },
  // `base` has no colour of its own to show off, so it reads as a quiet
  // outline instead of a light-grey block on a dark card.
  tierBadgeBase: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tierBadgeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tierBadgeTextBase: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  // The whole card is already the tap target — this just says how much more
  // is waiting on the other side of it.
  cardMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
  },
  // Green, like the contribution values it stands for.
  cardMoreText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '700',
    color: theme.colors.success,
  },
  cardMoreChevron: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.success,
    opacity: 0.7,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[14],
    marginBottom: theme.spacing[14],
  },
  goalRingPercent: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '900',
    color: 'rgba(255, 255, 255, 0.9)',
    
  },
  // Its own column between the ring and the gain badge: takes the room the
  // two of them leave and wraps to a second line rather than squeezing
  // either. Same 15/700 as MetaGoalCard's title in the goals list.
  goalTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  goalBadge: {
    flexShrink: 0,
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
    justifyContent: 'space-between',
    gap: theme.spacing[8],
  },
  contributionLabel: {
    flexShrink: 1,
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
