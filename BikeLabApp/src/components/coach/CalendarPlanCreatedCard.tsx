import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Path} from 'react-native-svg';
import {ACCENT, CoachCard, Eyebrow, FooterLink, IconTile} from './CoachCardChrome';
import {CreatedCalendarEvent} from './CalendarEventCreatedCard';

// Parses a bare "YYYY-MM-DD" (or "YYYY-MM-DDT...") date with an explicit
// local-time marker so it doesn't shift a day for anyone west of UTC — same
// trick as CalendarEventCreatedCard/CalendarScreen use.
function parseLocalDate(dateStr: string): Date | null {
  const datePart = dateStr?.split('T')[0];
  const d = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const CheckIcon: React.FC<{color: string}> = ({color}) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Path d="M5 10.2L8.4 13.5L15 6.5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// Shown instead of one CalendarEventCreatedCard per event whenever a single
// coach turn creates more than one — a "plan my week" reply used to stack
// half a dozen near-identical cards in the chat, which was more clutter
// than information. One summary card + a single "View in Calendar" link
// covers it — visual language ported from the "Rich Chat Cards v2"
// reference's "Plan Created" card (checkmark icon tile, blue accent).
export const CalendarPlanCreatedCard: React.FC<{
  events: CreatedCalendarEvent[];
  onPress: () => void;
}> = ({events, onPress}) => {
  const {t} = useTranslation();
  const accent = ACCENT.blue;

  const dates = events
    .map(e => parseLocalDate(e.start_date))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  const rangeLabel = (() => {
    if (dates.length === 0) return '';
    const fmt = (d: Date) => d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
    const first = dates[0];
    const last = dates[dates.length - 1];
    return first.getTime() === last.getTime() ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
  })();

  // Only show a goal chip when every event in this plan shares the exact
  // same goal — the common case (the whole plan supports one goal). A mixed
  // batch (some linked, some not, or linked to different goals) has no
  // single answer to "supports:", so say nothing rather than guess.
  const distinctGoalTitles = Array.from(new Set(events.map(e => e.goal_title || null)));
  const sharedGoalTitle = distinctGoalTitles.length === 1 ? distinctGoalTitles[0] : null;

  return (
    <CoachCard accent={accent} onPress={onPress}>
      <View style={styles.headRow}>
        <IconTile accent={accent}>
          <CheckIcon color={accent.icon} />
        </IconTile>
        <Eyebrow>{t('coach.calendarPlanCreatedLabel')}</Eyebrow>
      </View>
      <Text style={styles.title}>{t('coach.calendarPlanCreatedTitle', {count: events.length})}</Text>
      {!!rangeLabel && <Text style={styles.meta}>{rangeLabel}</Text>}
      {!!sharedGoalTitle && (
        <View style={styles.goalChip}>
          <Text style={styles.goalChipText} numberOfLines={1}>
            {t('coach.supportsGoal', {goal: sharedGoalTitle})}
          </Text>
        </View>
      )}
      <FooterLink label={t('coach.viewInCalendar')} />
    </CoachCard>
  );
};

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: '#0E0E12',
    marginTop: 12,
  },
  meta: {
    fontSize: 13,
    color: '#9A9AA2',
    marginTop: 4,
  },
  goalChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(47,75,223,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(47,75,223,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
  },
  goalChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2F4BDF',
  },
});
