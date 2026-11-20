// The goal's training plan on the goal screen (owner, 19.11.2026): a card
// with one bar per week of the plan — its height is the week's planned
// time, a week that has passed is filled by the share actually ridden, the
// current week is blue — the next session, and the way to the calendar.
// A goal that has no plan yet gets, in the same place, the card that asks
// the coach for one.
import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Text, TouchableOpacity, View, type LayoutChangeEvent} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {goalPlanTimeline, isMetaGoalExpired, weeksToTarget, type GoalPlanTimeline, type PlanRide} from '@bikelab/shared/calc';
import type {MetaGoal} from '@bikelab/shared/types';
import {fmtDate} from '../Calendar/lib';
import {isCyclingActivity} from '../../components/ShareStudio/goal/recap';
import {useCalendar} from '../../data/hooks/useCalendar';
import type {Activity} from '../../types/activity';
import {makeStyles, useTheme, withOpacity} from '../../theme';
import {formatScheduleDate} from './lib';
import {
  BAR_GAP_PX,
  RACE_DOT_PX,
  barShares,
  doneShare,
  formatPlanTime,
  ghostBarShares,
  placeCaptions,
  type PlanCaption,
} from './planCardLib';

const BARS_HEIGHT_PX = 64;
const BAR_RADIUS_PX = 4;
const GO_ICON_SIZE_PX = 18;

function shortDate(date: string, locale: string): string {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(locale, {day: 'numeric', month: 'short'});
}

const SECONDS_PER_MINUTE = 60;

/** The rider's bike rides as the timeline counts them: the day (as the calendar shows it) and the moving time. */
function toPlanRides(activities: readonly Activity[]): PlanRide[] {
  return activities
    .filter(isCyclingActivity)
    .map(activity => ({date: activity.start_date_local ?? activity.start_date, minutes: activity.moving_time / SECONDS_PER_MINUTE}));
}

interface GoalPlanProps {
  metaGoal: MetaGoal;
  /** The rider's synced activities — what a week's "done" is counted from. */
  activities: readonly Activity[];
  locale: string;
  onOpenCalendar: () => void;
  /** Opens the coach with the request for a plan for this goal. */
  onCreatePlan: () => void;
}

/**
 * The plan card for a goal: the timeline when the goal has training
 * sessions in the calendar, the "Create a plan" card when an open goal has
 * none, nothing while the calendar is loading or for a goal that is over.
 */
export const GoalPlan: React.FC<GoalPlanProps> = ({metaGoal, activities, locale, onOpenCalendar, onCreatePlan}) => {
  const {data: events, isLoading} = useCalendar({goalId: metaGoal.id});
  if (isLoading || !events) return null;

  const today = fmtDate(new Date());
  const timeline = goalPlanTimeline(events, {today, targetDate: metaGoal.target_date, rides: toPlanRides(activities)});
  if (timeline) {
    return (
      <GoalPlanCard
        timeline={timeline}
        targetDate={metaGoal.target_date ?? null}
        // A race in the calendar under this goal: the date is a start line,
        // not just a deadline.
        hasRace={events.some(event => event.type === 'event')}
        showNextSession={metaGoal.status !== 'completed'}
        locale={locale}
        onOpenCalendar={onOpenCalendar}
      />
    );
  }
  if (metaGoal.status === 'completed' || isMetaGoalExpired(metaGoal)) return null;
  return <CreatePlanCard weeksToGo={weeksToTarget(today, metaGoal.target_date)} onPress={onCreatePlan} />;
};

interface GoalPlanCardProps {
  timeline: GoalPlanTimeline;
  targetDate: string | null;
  hasRace: boolean;
  showNextSession: boolean;
  locale: string;
  onOpenCalendar: () => void;
}

export const GoalPlanCard: React.FC<GoalPlanCardProps> = ({
  timeline,
  targetDate,
  hasRace,
  showNextSession,
  locale,
  onOpenCalendar,
}) => {
  const {t} = useTranslation();
  const [rowWidth, setRowWidth] = useState(0);
  const {weeks, currentWeek, phase, peakWeek} = timeline;
  const shares = barShares(weeks);
  const total = weeks.length;
  const current = currentWeek == null ? null : weeks[currentWeek];
  // The plan's last week holds the goal's date: the dot after the bars is that day.
  const endDate = targetDate && targetDate.slice(0, 10) >= weeks[total - 1].start ? targetDate : null;

  const title =
    current && currentWeek != null
      ? t('goalDetails.planWeekOf', {week: currentWeek + 1, total})
      : phase === 'ahead'
        ? t('goalDetails.planAheadTitle', {total})
        : t('goalDetails.planOverTitle');
  const side = current
    ? current.plannedMin <= 0
      ? t('goalDetails.planRestWeek')
      : current.doneMin > 0
        ? t('goalDetails.planDoneThisWeek', {
            done: formatPlanTime(current.doneMin, t),
            planned: formatPlanTime(current.plannedMin, t),
          })
        : t('goalDetails.planPlannedThisWeek', {planned: formatPlanTime(current.plannedMin, t)})
    : phase === 'ahead'
      ? t('goalDetails.planStarts', {date: shortDate(weeks[0].start, locale)})
      : t('goalDetails.planOverSummary', {
          done: formatPlanTime(timeline.doneMin, t),
          planned: formatPlanTime(timeline.plannedMin, t),
        });

  // In order of importance — placeCaptions drops what does not fit.
  const captions: PlanCaption[] = [];
  if (current && currentWeek != null) {
    captions.push({
      key: 'current',
      text: t('goalDetails.planLabelThisWeek'),
      anchor: currentWeek,
      bold: true,
    });
  }
  if (endDate) {
    captions.push({
      key: 'end',
      text: t(hasRace ? 'goalDetails.planLabelRace' : 'goalDetails.planLabelDue', {date: shortDate(endDate, locale)}),
      anchor: 'right',
    });
  }
  captions.push({key: 'start', text: t('goalDetails.planLabelStart'), anchor: 'left'});
  if (phase !== 'over' && peakWeek !== currentWeek) {
    captions.push({
      key: 'peak',
      text: t('goalDetails.planLabelPeak', {time: formatPlanTime(weeks[peakWeek].plannedMin, t)}),
      anchor: peakWeek,
    });
  }
  const placed = placeCaptions(captions, {width: rowWidth, barCount: total, hasRaceDot: !!endDate});

  const handleRowLayout = (event: LayoutChangeEvent) => setRowWidth(event.nativeEvent.layout.width);
  const next = showNextSession ? timeline.nextSession : null;

  return (
    <View style={styles.card} testID="goal-plan-card">
      {/* The eyebrow and the week on the left as one block; the badge — how
          the week (or the whole plan, before and after it) stands — on the
          right, centred against that block, so nothing hangs under an
          empty corner. */}
      <View style={styles.weekRow}>
        <View style={styles.weekText}>
          <Text style={styles.eyebrow}>{t('goalDetails.planEyebrow')}</Text>
          <Text style={styles.weekTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={styles.badge} testID="goal-plan-badge">
          <Text style={styles.badgeText} numberOfLines={1}>
            {side}
          </Text>
        </View>
      </View>

      <View style={styles.bars} onLayout={handleRowLayout} testID="goal-plan-bars">
        {weeks.map((week, i) => {
          const isCurrent = i === currentWeek;
          const isPast = phase === 'over' || (currentWeek != null && i < currentWeek);
          return (
            <View
              key={week.start}
              style={[styles.bar, {height: Math.round(shares[i] * BARS_HEIGHT_PX)}, isCurrent && styles.barCurrent]}
              testID={isCurrent ? 'goal-plan-week-current' : `goal-plan-week-${i}`}>
              {isCurrent || isPast ? (
                <View
                  style={[styles.barDone, isCurrent && styles.barDoneCurrent, {height: `${Math.round(doneShare(week) * 100)}%`}]}
                />
              ) : null}
            </View>
          );
        })}
        {endDate ? <View style={styles.raceDot} testID="goal-plan-race" /> : null}
      </View>
      <View style={styles.captions}>
        {placed.map(caption => (
          <Text
            key={caption.key}
            style={[styles.caption, caption.bold && styles.captionCurrent, {left: caption.left, width: caption.width + CAPTION_SLACK_PX}]}
            numberOfLines={1}>
            {caption.text}
          </Text>
        ))}
      </View>

      {/* One way to the calendar, at the foot of the card: the next session
          when there is one to ride, a plain link otherwise. */}
      {next ? (
        <TouchableOpacity style={styles.next} activeOpacity={0.7} onPress={onOpenCalendar} testID="goal-plan-next">
          <View style={styles.nextText}>
            <Text style={styles.eyebrow}>{t('goalDetails.planNextSession')}</Text>
            <Text style={styles.nextTitle} numberOfLines={1}>
              {next.title}
            </Text>
          </View>
          <Text style={styles.nextWhen}>{formatScheduleDate(next.date, locale)}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.next, styles.footerLink]} activeOpacity={0.7} onPress={onOpenCalendar} testID="goal-plan-calendar">
          <Text style={styles.link}>{t('goalDetails.planCalendar')}</Text>
          <Text style={[styles.chevron, styles.chevronLink]}>›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export const CreatePlanCard: React.FC<{weeksToGo: number | null; onPress: () => void}> = ({weeksToGo, onPress}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  return (
    <TouchableOpacity style={[styles.card, styles.cardEmpty]} activeOpacity={0.85} onPress={onPress} testID="goal-plan-create">
      <View style={styles.head}>
        <Text style={styles.eyebrow}>{t('goalDetails.planEyebrow')}</Text>
      </View>
      <View style={styles.weekRow}>
        <Text style={styles.weekTitle}>{t('goalDetails.planEmptyTitle')}</Text>
        {weeksToGo ? <Text style={styles.weekSide}>{t('goalDetails.planWeeksToGo', {count: weeksToGo})}</Text> : null}
      </View>
      <View style={styles.bars}>
        {ghostBarShares(weeksToGo).map((share, i) => (
          <View key={i} style={[styles.bar, styles.barGhost, {height: Math.round(share * BARS_HEIGHT_PX)}]} />
        ))}
        {weeksToGo ? <View style={[styles.raceDot, styles.raceDotGhost]} /> : null}
      </View>
      <View style={styles.create}>
        <View style={styles.nextText}>
          <Text style={styles.createTitle}>{t('goalDetails.planCreate')}</Text>
          <Text style={styles.createHint}>{t('goalDetails.planCreateHint')}</Text>
        </View>
        <View style={styles.go}>
          <Svg width={GO_ICON_SIZE_PX} height={GO_ICON_SIZE_PX} viewBox="0 0 24 24" fill="none" stroke={theme.colors.text.inverse} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12h14" />
            <Path d="M12 5l7 7-7 7" />
          </Svg>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// The caption's width is an estimate (see placeCaptions); a little slack
// keeps a slightly wider glyph run from being cut.
const CAPTION_SLACK_PX = 8;

const styles = makeStyles(theme => ({
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    paddingTop: theme.spacing[14],
    paddingHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[12],
  },
  cardEmpty: {
    borderStyle: 'dashed',
    borderColor: withOpacity(theme.colors.accent, 0.3),
    backgroundColor: withOpacity(theme.colors.surfaceElevated, 0.86),
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[6],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.colors.coach.eyebrowText,
  },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing[12],
    marginBottom: theme.spacing[14],
  },
  badge: {
    flexShrink: 1,
    paddingHorizontal: theme.spacing[10],
    paddingVertical: 5,
    borderRadius: theme.radii.pill,
    backgroundColor: withOpacity(theme.colors.text.primary, 0.06),
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  weekText: {
    flexShrink: 1,
    gap: theme.spacing[6],
  },
  weekTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: theme.colors.text.primary,
  },
  weekSide: {
    flexShrink: 1,
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: BAR_GAP_PX,
    height: BARS_HEIGHT_PX,
  },
  bar: {
    flex: 1,
    // Rounded corners, not a pill: a light week's short bar under a full
    // radius turns into a dot (owner, on the phone, 19.11.2026).
    borderRadius: BAR_RADIUS_PX,
    backgroundColor: withOpacity(theme.colors.text.primary, 0.1),
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  // Blue alone marks the current week — no outline (owner, 19.11.2026).
  barCurrent: {
    backgroundColor: withOpacity(theme.colors.accent, 0.22),
  },
  barDone: {
    backgroundColor: theme.colors.goalPlanDone,
  },
  barDoneCurrent: {
    backgroundColor: theme.colors.accent,
  },
  barGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.text.primary, 0.13),
  },
  raceDot: {
    width: RACE_DOT_PX,
    height: RACE_DOT_PX,
    borderRadius: RACE_DOT_PX / 2,
    marginLeft: 2,
    backgroundColor: theme.colors.text.primary,
  },
  raceDotGhost: {
    backgroundColor: withOpacity(theme.colors.text.primary, 0.25),
  },
  captions: {
    height: 14,
    marginTop: 6,
  },
  caption: {
    position: 'absolute',
    top: 0,
    fontSize: 10,
    fontWeight: '500',
    color: theme.colors.text.iosMuted,
  },
  captionCurrent: {
    fontWeight: '700',
    color: theme.colors.accent,
  },
  next: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: theme.spacing[8],
    marginTop: theme.spacing[12],
    paddingTop: theme.spacing[12],
    borderTopWidth: 1,
    borderTopColor: theme.colors.coach.divider,
  },
  nextText: {
    flex: 1,
  },
  nextTitle: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  nextWhen: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  chevron: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '600',
    color: theme.colors.text.iosMutedLight,
  },
  chevronLink: {
    color: theme.colors.accent,
  },
  footerLink: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing[4],
  },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    marginTop: theme.spacing[14],
    paddingTop: theme.spacing[12],
    borderTopWidth: 1,
    borderTopColor: theme.colors.coach.divider,
  },
  createTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  createHint: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text.secondary,
  },
  go: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
}));
