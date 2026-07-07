import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';

const TYPE_COLORS: Record<string, string> = {
  planned_ride: '#274dd3',
  rest_day: '#6B7280',
  maintenance: '#F59E0B',
  purchase: '#10B981',
  event: '#FC5200',
  note: '#8B5CF6',
};

export interface CreatedCalendarEvent {
  id: number;
  type: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  location?: string;
  goal_id?: number | null;
  goal_title?: string | null;
}

// Shown inline in the chat when the coach's create_calendar_event tool call
// succeeds — mirrors GoalCreatedCard's layout (accent bar + eyebrow + title
// + footer link) so the two "created X" cards read as the same family.
export const CalendarEventCreatedCard: React.FC<{
  event: CreatedCalendarEvent;
  onPress: () => void;
}> = ({event, onPress}) => {
  const {t} = useTranslation();
  const color = TYPE_COLORS[event.type] || TYPE_COLORS.planned_ride;
  const typeLabel = t(`calendar.types.${event.type}`, {defaultValue: event.type});

  // Parse the date-only portion and construct with an explicit local-time
  // marker (no 'Z') — same trick CalendarScreen's formatDayHeader uses.
  // Constructing straight from a bare "YYYY-MM-DD" string makes JS parse it
  // as UTC midnight per spec, which .toLocaleDateString() then renders in
  // the device's local zone — shifting the displayed day by one for anyone
  // west of UTC. Appending "T00:00:00" forces local-time parsing instead,
  // so the date shown here always matches what CalendarScreen buckets it
  // under, regardless of device timezone.
  const dateLabel = (() => {
    const datePart = event.start_date?.split('T')[0];
    const d = new Date(`${datePart}T00:00:00`);
    if (Number.isNaN(d.getTime())) return event.start_date;
    return d.toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'});
  })();

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.accent, {backgroundColor: color}]} />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{t('coach.calendarEventCreatedLabel')}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {typeLabel} · {dateLabel}
          {event.location ? ` · ${event.location}` : ''}
        </Text>
        {!!event.description && (
          <Text style={styles.description} numberOfLines={2}>
            {event.description}
          </Text>
        )}
        {!!event.goal_title && (
          <View style={styles.goalBadge}>
            <Text style={styles.goalBadgeText} numberOfLines={1}>
              {t('coach.supportsGoal', {goal: event.goal_title})}
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
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ECECEC',
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 4,
    maxWidth: '90%',
  },
  accent: {
    width: 4,
  },
  content: {
    flex: 1,
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
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: '#888',
    lineHeight: 16,
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
