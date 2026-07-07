import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {CreatedCalendarEvent} from './CalendarEventCreatedCard';

const TYPE_COLORS: Record<string, string> = {
  planned_ride: '#274dd3',
  rest_day: '#6B7280',
  maintenance: '#F59E0B',
  purchase: '#10B981',
  event: '#FC5200',
  note: '#8B5CF6',
};

// Parses a bare "YYYY-MM-DD" (or "YYYY-MM-DDT...") date with an explicit
// local-time marker so it doesn't shift a day for anyone west of UTC — same
// trick as CalendarEventCreatedCard/CalendarScreen use.
function parseLocalDate(dateStr: string): Date | null {
  const datePart = dateStr?.split('T')[0];
  const d = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Shown instead of one CalendarEventCreatedCard per event whenever a single
// coach turn creates more than one — a "plan my week" reply used to stack
// half a dozen near-identical cards in the chat, which was more clutter
// than information. One summary card + a single "View in Calendar" link
// covers it; the individual events are still all in the calendar itself.
export const CalendarPlanCreatedCard: React.FC<{
  events: CreatedCalendarEvent[];
  onPress: () => void;
}> = ({events, onPress}) => {
  const {t} = useTranslation();

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

  const distinctTypes = Array.from(new Set(events.map(e => e.type)));

  // Only show a goal badge when every event in this plan shares the exact
  // same goal — the common case (the whole plan supports one goal). A mixed
  // batch (some linked, some not, or linked to different goals) has no
  // single answer to "supports:", so say nothing rather than guess.
  const distinctGoalTitles = Array.from(new Set(events.map(e => e.goal_title || null)));
  const sharedGoalTitle = distinctGoalTitles.length === 1 ? distinctGoalTitles[0] : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.accentRow}>
        {(distinctTypes.length > 0 ? distinctTypes : ['planned_ride']).map(type => (
          <View
            key={type}
            style={[styles.accentSegment, {backgroundColor: TYPE_COLORS[type] || TYPE_COLORS.planned_ride}]}
          />
        ))}
      </View>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{t('coach.calendarPlanCreatedLabel')}</Text>
        <Text style={styles.title}>{t('coach.calendarPlanCreatedTitle', {count: events.length})}</Text>
        {!!rangeLabel && <Text style={styles.meta}>{rangeLabel}</Text>}
        {!!sharedGoalTitle && (
          <View style={styles.goalBadge}>
            <Text style={styles.goalBadgeText} numberOfLines={1}>
              {t('coach.supportsGoal', {goal: sharedGoalTitle})}
            </Text>
          </View>
        )}
        <View style={styles.footer}>
          <Text style={styles.viewDetails}>{t('coach.viewInCalendar')} →</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ECECEC',
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 4,
    maxWidth: '90%',
  },
  accentRow: {
    flexDirection: 'row',
    height: 4,
  },
  accentSegment: {
    flex: 1,
  },
  content: {
    padding: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  meta: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  goalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(39, 77, 211, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  goalBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#274dd3',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  viewDetails: {
    fontSize: 12,
    fontWeight: '700',
    color: '#274dd3',
  },
});
