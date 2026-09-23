// "Metrics" tab of GoalDetailsScreen — one progress card per sub-goal
// (T-5.4, audit A-27).
import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, type ViewStyle} from 'react-native';
import type {Goal} from '@bikelab/shared/types';
import type {HealthContext} from '../../utils/healthService';
import {makeStyles, useTheme} from '../../theme';
import {currentValueForGoal, percentageForGoal, getGoalTypeLabel, getGoalUnit, getPaceBadge} from './lib';

interface MetricsTabProps {
  subGoals: Goal[];
  healthContext: HealthContext | undefined;
}

export const MetricsTab: React.FC<MetricsTabProps> = ({subGoals, healthContext}) => {
  const {t} = useTranslation();
  const theme = useTheme();

  return (
    <View style={styles.section}>
      {subGoals.map(goal => {
        // Server (GET /api/meta-goals/:id) already computed current_value
        // fresh via goalCalculator — the one exception is health-source
        // goals, which the server can't compute (Apple Health is
        // client-only), so those read the live value from useHealthData().
        const current = currentValueForGoal(goal, healthContext);
        const target = Number(goal.target_value) || 1;
        const percentage = percentageForGoal(goal, healthContext);
        const label = goal.title || getGoalTypeLabel(goal.goal_type, t);
        const unit = goal.unit || getGoalUnit(goal.goal_type, t);
        const paceBadge = getPaceBadge(goal, t);
        const progressColor =
          percentage >= 100 ? theme.colors.success : percentage >= 50 ? theme.colors.warning : theme.colors.danger;
        const progressFillStyle: ViewStyle = {width: `${percentage}%`, backgroundColor: progressColor};

        return (
          <View key={goal.id} style={styles.goalCard}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalTitle}>{label}</Text>
              {/* Date range used to live here — dropped in favor of the
                  pace badge (the thing that actually matters at a
                  glance); dates are still visible per-goal via the
                  derived "Due" pill up in the header. */}
              {paceBadge ? <View style={[styles.paceHeaderBadge, {backgroundColor: paceBadge.color + '18'}]}>
                  <Text style={[styles.paceHeaderBadgeText, {color: paceBadge.color}]}>{paceBadge.label}</Text>
                </View> : null}
            </View>

            {goal.description ? <Text style={styles.goalDescription}>{goal.description}</Text> : null}

            <View style={styles.progressRow}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, progressFillStyle]} />
              </View>
              <Text style={styles.progressPercentage}>{Math.round(percentage)}%</Text>
            </View>

            <View style={styles.statsRow}>
              <Text style={styles.statText}>
                {t('goalDetails.current')}
                <Text style={styles.statValue}>
                  {(Number(current) || 0).toFixed(1)} {unit}
                </Text>
              </Text>
              <Text style={styles.statText}>
                {t('goalDetails.target')}
                <Text style={styles.statValue}>
                  {(Number(target) || 1).toFixed(1)} {unit}
                </Text>
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = makeStyles(theme => ({
  section: {
    paddingHorizontal: 0,
  },
  goalCard: {
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing[16],
    marginHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[8],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[32],
  },
  goalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
    flex: 1,
  },
  // Tinted pace pill in the metric card's header — replaces the old date
  // range badge (goalPeriod), moved here per design direction since pace
  // is the thing worth a glance, not the raw dates.
  paceHeaderBadge: {
    paddingHorizontal: theme.spacing[10],
    paddingVertical: theme.spacing[4] + 1,
    borderRadius: theme.radii.pill,
  },
  paceHeaderBadgeText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
  },
  goalDescription: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.muted,
    marginBottom: theme.spacing[16],
    lineHeight: 18,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[12],
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: theme.colors.bikes.statDivider,
    overflow: 'hidden',
    marginRight: theme.spacing[8],
    borderRadius: theme.radii.pill,
  },
  progressFill: {
    height: '100%',
  },
  progressPercentage: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '800',
    color: theme.colors.text.primary,
    minWidth: 40,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.muted,
  },
  statValue: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
}));
