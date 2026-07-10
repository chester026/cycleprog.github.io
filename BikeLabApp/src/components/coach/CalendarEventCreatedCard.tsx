import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Path, Rect} from 'react-native-svg';
import {ACCENT, CoachCard, Eyebrow, FooterLink, IconTile} from './CoachCardChrome';

const TYPE_ACCENT: Record<string, typeof ACCENT.blue> = {
  planned_ride: ACCENT.blue,
  rest_day: ACCENT.gray,
  maintenance: ACCENT.amber,
  purchase: ACCENT.green,
  event: ACCENT.orange,
  note: ACCENT.purple,
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

const CalendarIcon: React.FC<{color: string}> = ({color}) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Rect x={3} y={4.5} width={14} height={12.5} rx={2.6} stroke={color} strokeWidth={1.7} />
    <Path d="M3.5 8H16.5" stroke={color} strokeWidth={1.7} />
    <Path d="M6.8 2.8V6M13.2 2.8V6" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);

// Shown inline in the chat when the coach's create_calendar_event tool call
// succeeds — visual language ported from the "Rich Chat Cards v2"
// reference, mirrors GoalCreatedCard so the two "created X" cards read as
// the same family. Event type still drives the accent color, same as the
// old side-strip did.
export const CalendarEventCreatedCard: React.FC<{
  event: CreatedCalendarEvent;
  onPress: () => void;
}> = ({event, onPress}) => {
  const {t} = useTranslation();
  const accent = TYPE_ACCENT[event.type] || TYPE_ACCENT.planned_ride;
  const typeLabel = t(`calendar.types.${event.type}`, {defaultValue: event.type});

  // Parse the date-only portion and construct with an explicit local-time
  // marker (no 'Z') — same trick CalendarScreen's formatDayHeader uses.
  const dateLabel = (() => {
    const datePart = event.start_date?.split('T')[0];
    const d = new Date(`${datePart}T00:00:00`);
    if (Number.isNaN(d.getTime())) return event.start_date;
    return d.toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'});
  })();

  return (
    <CoachCard accent={accent} onPress={onPress}>
      <View style={styles.headRow}>
        <IconTile accent={accent}>
          <CalendarIcon color={accent.icon} />
        </IconTile>
        <Eyebrow>{t('coach.calendarEventCreatedLabel')}</Eyebrow>
      </View>
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
        <View style={styles.goalChip}>
          <Text style={styles.goalChipText} numberOfLines={1}>
            {t('coach.supportsGoal', {goal: event.goal_title})}
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
  description: {
    fontSize: 13,
    color: '#61616B',
    lineHeight: 18,
    marginTop: 6,
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
