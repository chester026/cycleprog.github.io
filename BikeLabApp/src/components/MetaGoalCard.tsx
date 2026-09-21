import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {getDateLocale} from '../i18n/dateLocale';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import type {MetaGoal} from '@bikelab/shared/types';
import {useHealthData} from '../hooks/useHealthData';
import {getHealthMetricValue} from '../utils/healthService';
import {TIER_CONFIG} from '@bikelab/shared/constants';
import {isMetaGoalExpired} from '@bikelab/shared/calc';

// TIER_CONFIG moved to @bikelab/shared/constants (T-2.4) — this file's base
// tier used '#F0F0F0' while GoalDetailsScreen.tsx and the web's
// GoalDetailPage.jsx agreed on '#ccc'; shared standardizes on the 2-of-3
// majority '#ccc' (see the T-2.4 report).

interface MetaGoalCardProps {
  metaGoal: MetaGoal;
  onPress: () => void;
}

// Complete/Delete used to live here as inline actions in the tier footer,
// but that duplicated what GoalDetailsScreen already offers (trash icon +
// the "Mark as complete" footer button) and cluttered a card whose only
// real job is "tap to open this goal". Replaced with a plain chevron that
// just signals the card is tappable — completing/deleting now only happens
// once you're actually inside the goal.
// Sub-goals (with server-computed current_value/percent) come inline on
// `metaGoal.sub_goals` from GET /api/meta-goals — no per-card GET /api/goals
// anymore (T-3.4, A-13, docs/audit/layers/02-bikelabapp.md A-13: "each card
// loads all goals + runs HealthKit"). `healthContext` is still built once
// per card (useHealthData) since health-source goals are still computed
// on-device only — see server/goalCalculator.js's file header.
export const MetaGoalCard: React.FC<MetaGoalCardProps> = ({
  metaGoal,
  onPress,
}) => {
  const {t} = useTranslation();
  // Apple Health data is client-only (never persisted server-side), so
  // health-source sub-goals read their live value from here instead of the
  // API's current_value, which for that source is just the last-synced
  // snapshot passed through unchanged — see server/goalCalculator.js.
  const {healthContext} = useHealthData();

  const tier = metaGoal.tier || 'base';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.base;
  const hasTierBorder = tier !== 'base';
  // Past its target date and still open: the card greys out and says so,
  // but the goal stays exactly where it is — nothing auto-completes it, and
  // only the rider (or the coach, after asking) closes or extends it.
  const expired = isMetaGoalExpired(metaGoal);

  const progress = useMemo(() => {
    const subGoals = metaGoal.sub_goals || [];
    const relevantGoals = subGoals.filter(g => g.goal_type !== 'ftp_vo2max');
    if (relevantGoals.length === 0) return 0;

    const progressValues = relevantGoals.map(goal => {
      const current = goal.source === 'health'
        ? getHealthMetricValue(healthContext, goal.metric?.health_metric, goal.current_value || 0)
        : (goal.current_value || 0);
      const target = goal.target_value || 1;
      return Math.min((current / target) * 100, 100);
    });

    const avgProgress = progressValues.reduce((sum, p) => sum + p, 0) / progressValues.length;
    return Math.round(avgProgress);
  }, [metaGoal.sub_goals, healthContext]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), {month: 'short', day: 'numeric', year: 'numeric'});
  };

  const getStatusColor = () => '#ccc';

  const getTruncatedDescription = (text: string | null | undefined) => {
    if (!text) return '';
    const match = text.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : text;
  };

  const size = 60;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const cardBody = (
    <View style={[styles.cardInner, expired && styles.cardInnerExpired]}>
      <View style={styles.content}>
          <View style={styles.progressCircleContainer}>
            <Svg width={size} height={size}>
              <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#eee" strokeWidth={strokeWidth} fill="none" />
              <Circle
                cx={size / 2} cy={size / 2} r={radius}
                stroke={getStatusColor()} strokeWidth={strokeWidth} fill="none"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                strokeLinecap="round" rotation="-90" origin={`${size / 2}, ${size / 2}`}
              />
            </Svg>
            <View style={styles.progressPercentage}>
              <Text style={styles.progressText}>{progress}<Text style={styles.progressTextPercent}>%</Text></Text>
            </View>
          </View>

          <View style={styles.rightContent}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, expired && styles.titleExpired]}>{metaGoal.title}</Text>
              {expired ? (
                <View style={styles.expiredBadge}>
                  <Text style={styles.expiredBadgeText}>{t('goals.expired')}</Text>
                </View>
              ) : null}
            </View>
            {metaGoal.target_date ? <Text style={styles.date}>{formatDate(metaGoal.target_date)}</Text> : null}
            <Text style={styles.description}>{getTruncatedDescription(metaGoal.description)}</Text>
          </View>
      </View>
    </View>
  );

  return (
    <TouchableOpacity
      style={[styles.cardOuter, expired && styles.cardOuterExpired]}
      onPress={onPress}
      activeOpacity={0.7}>
      {cardBody}
      <View style={[styles.tierFooterWrap, hasTierBorder && {shadowColor: tierCfg.color}]}>
        <View style={[styles.tierFooter, {backgroundColor: tierCfg.color}]}>
          <Text style={[styles.tierFooterText, !hasTierBorder && styles.tierFooterTextBase]}>
            {t(tierCfg.key)}
          </Text>
          <Text style={[styles.tierChevron, !hasTierBorder && styles.tierChevronBase]}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardOuter: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 16,
    
  },
  cardInner: {
    backgroundColor: '#fff',
    padding: 16,
    paddingBottom: 8,
    paddingTop: 20,
    borderRadius: 16,
  },
  // Expired: the whole card goes flat grey instead of white, so a stalled
  // goal reads as stalled at a glance in the list.
  cardOuterExpired: {
    borderColor: '#E4E4E4',
  },
  cardInnerExpired: {
    backgroundColor: '#F4F4F4',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleExpired: {
    color: '#8E8E93',
  },
  expiredBadge: {
    backgroundColor: '#EDEDED',
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  expiredBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tierFooterWrap: {
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  
  },
  tierFooter: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
   
  },
  tierFooterText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tierFooterTextBase: {
    color: '#999',
  },
  // Plain chevron replacing the old Complete/Delete actions — just signals
  // the card is tappable, actual complete/delete now live inside
  // GoalDetailsScreen only (its own trash icon + footer button).
  tierChevron: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 18,
    fontWeight: '700',
  },
  tierChevronBase: {
    color: '#999',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  progressCircleContainer: {
    position: 'relative',
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -6,
  },
  progressPercentage: {
    position: 'absolute',
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1a1a1a',
    marginLeft: 4,
  },
  progressTextPercent: {
    fontSize: 10,
    color: '#888',
    fontWeight: '900',
  },
  rightContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 12,
    lineHeight: 18,
  },
});
