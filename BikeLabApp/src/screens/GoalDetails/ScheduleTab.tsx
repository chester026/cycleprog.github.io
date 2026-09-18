// "Schedule" tab of GoalDetailsScreen — every calendar_events row linked to
// this goal (past + future — the server skips its usual date window
// entirely when goal_id is passed, see GET /api/calendar in server.js).
// This is the other half of "how's my goal going": not just metric
// progress from activities, but the actual training plan built for it
// (T-5.4, audit A-27).
import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ActivityIndicator, TouchableOpacity} from 'react-native';
import type {CalendarEvent} from '@bikelab/shared/types';
import {useCalendar} from '../../data/hooks/useCalendar';
import {makeStyles} from '../../theme';
import {formatScheduleDate, getScheduleTypeColor} from './lib';

interface ScheduleTabProps {
  goalId: number | string;
  locale: string;
  onViewCalendar: () => void;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({goalId, locale, onViewCalendar}) => {
  const {t} = useTranslation();
  const {data: scheduledEvents = [], isLoading: loadingScheduled} = useCalendar({goalId});

  const sorted: CalendarEvent[] = [...scheduledEvents].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

  return (
    <View style={styles.section}>
      {loadingScheduled ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#274dd3" />
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t('goalDetails.noScheduled')}</Text>
          <Text style={styles.emptyStateSubtext}>{t('goalDetails.noScheduledHint')}</Text>
        </View>
      ) : (
        <>
          {sorted.map(ev => (
            <View key={ev.id} style={styles.scheduleRow}>
              <View style={[styles.scheduleDot, {backgroundColor: getScheduleTypeColor(ev.type)}]} />
              <View style={styles.scheduleContent}>
                <Text style={[styles.scheduleTitle, ev.completed && styles.scheduleTitleDone]} numberOfLines={1}>
                  {ev.title}
                </Text>
                <Text style={styles.scheduleDate}>{formatScheduleDate(ev.start_date, locale)}</Text>
              </View>
              {ev.completed && <Text style={styles.scheduleDoneBadge}>{t('goalDetails.done')}</Text>}
            </View>
          ))}
          <TouchableOpacity style={styles.viewCalendarBtn} onPress={onViewCalendar}>
            <Text style={styles.viewCalendarBtnText}>{t('coach.viewInCalendar')} →</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = makeStyles(theme => ({
  section: {
    paddingHorizontal: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[8],
  },
  emptyStateSubtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.muted,
    textAlign: 'center',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm + 2,
    padding: theme.spacing[12],
    marginHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[8],
    gap: theme.spacing[10],
  },
  scheduleDot: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  scheduleContent: {
    flex: 1,
  },
  scheduleTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  scheduleTitleDone: {
    color: '#999',
    textDecorationLine: 'line-through',
  },
  scheduleDate: {
    fontSize: theme.typography.fontSize.md,
    color: '#999',
    marginTop: 1,
    textTransform: 'capitalize',
  },
  scheduleDoneBadge: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.success,
  },
  viewCalendarBtn: {
    alignSelf: 'center',
    marginTop: theme.spacing[8],
    marginBottom: theme.spacing[16],
  },
  viewCalendarBtnText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.accent,
  },
}));
