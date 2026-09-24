// "Goals" strip on the Garage — every completed goal as a small trophy
// card: the title, one grey line "Sep 21 · N days · N rides" under it, and the
// tier/status pills + share button (straight into the goal Share Studio)
// along the bottom. Same section chrome as
// AchievementsPreview/ChecklistPreview (GarageSectionTitle + grey cards in
// a horizontal row). Renders nothing until there's a completed goal.
import React from 'react';
import {View, Text, ScrollView, TouchableOpacity, useWindowDimensions} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {MetaGoal} from '@bikelab/shared/types';
import {TIER_CONFIG} from '@bikelab/shared/constants';
import {ShareIcon} from '../../assets/img/icons/ShareIcon';
// recap directly, not the goal/ index — that one pulls in the whole studio
// (view-shot, share, camera roll) just for a formatter.
import {formatBigNumber, type GoalRecap} from '../../components/ShareStudio/goal/recap';
import {getDateLocale} from '../../i18n/dateLocale';
import {makeStyles, useTheme} from '../../theme';
import {GarageSectionTitle} from './GarageSectionTitle';
import {GALLERY_CARD_WIDTH_RATIO} from '../../constants/garageCards';

const LIST_INSET = 16;
const CARD_GAP = 8;

export interface CompletedGoalItem {
  goal: MetaGoal;
  recap: GoalRecap;
  /** completed_at (or updated_at on older servers) — not recap.end, which is capped at the deadline. */
  completedAt: Date;
}

export interface CompletedGoalsProps {
  items: CompletedGoalItem[];
  onOpen: (goal: MetaGoal) => void;
  onShare: (goal: MetaGoal) => void;
}

export const CompletedGoals: React.FC<CompletedGoalsProps> = ({items, onOpen, onShare}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  // Same width as the gallery photos right above (owner).
  const {width: screenWidth} = useWindowDimensions();
  const cardWidth = Math.round(screenWidth * GALLERY_CARD_WIDTH_RATIO);

  if (items.length === 0) return null;

  return (
    <View style={styles.section} testID="garage-completed-goals">
      <View style={styles.header}>
        <GarageSectionTitle title={t('garage.goals')} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {items.map(({goal, recap, completedAt}) => {
          const tier = goal.tier || 'base';
          // Same rule as GoalHeader: only the highlighted tiers get a badge.
          const showTier = tier === 'epic' || tier === 'grand' || tier === 'legendary';
          const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.base;
          // One grey line under the title (owner): short completion date,
          // how long it took, how many rides — no km/m, no separate date row.
          const details = [
            completedAt.toLocaleDateString(getDateLocale(), {day: 'numeric', month: 'short'}),
            t('goalShare.daysCount', {count: recap.days}),
            `${formatBigNumber(recap.rides)} ${t('goalShare.ridesUnit', {count: recap.rides})}`,
          ];

          return (
            <TouchableOpacity key={String(goal.id)} style={[styles.card, {width: cardWidth}]} onPress={() => onOpen(goal)} activeOpacity={0.8}>
              <View>
                <Text style={styles.title} numberOfLines={2}>
                  {goal.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {details.join(' · ')}
                </Text>
              </View>

              <View style={styles.bottomRow}>
                <View style={styles.badges}>
                  {showTier ? (
                    <View style={[styles.badge, {backgroundColor: tierCfg.color}]}>
                      <Text style={styles.tierBadgeText}>{t(tierCfg.key)}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.badge, styles.statusBadge]}>
                    <Text style={styles.statusBadgeText}>{t('goalDetails.completed')}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  testID={`garage-goal-share-${goal.id}`}
                  style={styles.shareButton}
                  onPress={() => onShare(goal)}
                  hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                  <ShareIcon size={16} color={theme.colors.text.secondary} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = makeStyles(theme => ({
  section: {
    marginTop: theme.spacing[8],
    marginBottom: theme.spacing[8],
  },
  header: {
    paddingHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[24],
  },
  scrollContent: {
    flexDirection: 'row',
    gap: CARD_GAP,
    paddingHorizontal: LIST_INSET,
  },
  // Same grey card as ChecklistPreview / OverallStats.
  card: {
    minHeight: 150,
    backgroundColor: theme.colors.speedWidget.cardBg,
    borderRadius: 24,
    padding: theme.spacing[18],
    paddingTop: theme.spacing[24],
    justifyContent: 'space-between',
    gap: theme.spacing[12],
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
    flexShrink: 1,
  },
  // Tier pill = GoalHeader's tierBadge at card scale: full fill, white
  // uppercase text; the status pill next to it is the same shape in grey.
  badge: {
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radii.pill,
  },
  tierBadgeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.colors.text.inverse,
  },
  statusBadge: {
    backgroundColor: theme.colors.checklistPreview.progressTrack,
  },
  statusBadgeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.colors.text.secondary,
  },
  // Flat grey, no shadow — a secondary action on a grey card.
  shareButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.checklistPreview.progressTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same as PlannedRidesWidget's rideTitle (owner: match the Rides cards).
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '800', // not in the typography scale yet — same literal as rideTitle
    color: theme.colors.text.primary,
  },
  meta: {
    marginTop: theme.spacing[6],
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
  },
}));
