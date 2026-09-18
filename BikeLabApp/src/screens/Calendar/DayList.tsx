// The scrolling list of day rows (each with its activity/event cards) —
// T-5.4/T-5.1, audit A-27. Extracted from CalendarScreen's renderDay/
// FlatList wiring.
import React, {forwardRef} from 'react';
import {ActivityIndicator, FlatList, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, useTheme} from '../../theme';
import {getDateLocale} from '../../i18n/dateLocale';
import type {Activity} from '../../types/activity';
import type {CalendarEvent} from '@bikelab/shared/types';
import {formatDuration, formatKm, isToday, parseDateOnly, type DayGroup} from './lib';

// Kept local rather than in theme/colors.ts — these are per-event-type
// accent colors, not general-purpose semantic tokens, and several of them
// (rest_day's gray, event's orange, note's purple) have no existing token
// to reuse without inventing new palette entries not requested by this
// task.
export const EVENT_COLORS: Record<string, string> = {
  planned_ride: '#274dd3', // theme.colors.accent
  rest_day: '#6B7280',
  maintenance: '#F59E0B', // theme.colors.warning
  purchase: '#10B981', // theme.colors.success
  event: '#FC5200',
  note: '#8B5CF6', // theme.colors.chart.series4
};

interface DayListProps {
  days: DayGroup[];
  loading: boolean;
  selectedDate: string;
  bottomPadding: number;
  onSelectActivity: (activity: Activity) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}

export const DayList = forwardRef<FlatList<DayGroup>, DayListProps>(
  ({days, loading, selectedDate, bottomPadding, onSelectActivity, onSelectEvent}, ref) => {
    const {t} = useTranslation();
    const theme = useTheme();
    const locale = getDateLocale();

    if (loading && days.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      );
    }

    if (days.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>{t('calendar.empty')}</Text>
        </View>
      );
    }

    const renderDay = ({item}: {item: DayGroup}) => {
      const today = isToday(item.date);
      // Only meaningful when it's not also today — today's own highlight
      // (the black outline + play button) takes precedence over the
      // dashed "this is the day selected in the strip" outline.
      const selected = !today && item.date === selectedDate;
      const dayDate = parseDateOnly(item.date);

      return (
        <View style={styles.dayRow}>
          <View style={styles.dayLeftCol}>
            <Text style={[styles.dayNumber, today && styles.dayNumberToday]}>{dayDate.getDate()}</Text>
            <Text style={[styles.dayLabel, today && styles.dayLabelToday]}>
              {today ? t('calendar.today') : dayDate.toLocaleDateString(locale, {weekday: 'short'})}
            </Text>
          </View>
          <View style={styles.dayCards}>
            {item.activities.map(act => (
              // Synced rides are always past/completed — never "today
              // scheduled" or selectable, so they only ever get the muted
              // + checkmark treatment regardless of which day is
              // highlighted.
              <TouchableOpacity
                key={`act-${act.id}`}
                style={[styles.row, styles.rowMuted]}
                activeOpacity={0.7}
                onPress={() => onSelectActivity(act)}>
                <View style={[styles.accentDot, styles.accentDotMuted]} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowTitleMuted} numberOfLines={1}>
                    {act.name}
                  </Text>
                  <Text style={styles.rowSubtitle}>
                    {formatKm(act.distance)} {t('common.km')} · {formatDuration(act.moving_time)}
                  </Text>
                </View>
                <Text style={styles.checkIcon}>✓</Text>
              </TouchableOpacity>
            ))}
            {item.events.map(ev => {
              const isTodayAction = today && !ev.completed;
              return (
                <TouchableOpacity
                  key={`ev-${ev.id}`}
                  style={[
                    styles.row,
                    ev.completed && styles.rowMuted,
                    isTodayAction && styles.rowToday,
                    selected && !ev.completed && styles.rowSelected,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => onSelectEvent(ev)}>
                  <View
                    style={[
                      styles.accentDot,
                      ev.completed
                        ? styles.accentDotMuted
                        : {backgroundColor: EVENT_COLORS[ev.type] || EVENT_COLORS.planned_ride},
                    ]}
                  />
                  <View style={styles.rowContent}>
                    <Text style={ev.completed ? styles.rowTitleMuted : styles.rowTitle} numberOfLines={1}>
                      {ev.title}
                    </Text>
                    {!!ev.location && (
                      <Text style={styles.rowSubtitle} numberOfLines={1}>
                        {ev.location}
                      </Text>
                    )}
                  </View>
                  {ev.completed ? (
                    <Text style={styles.checkIcon}>✓</Text>
                  ) : isTodayAction ? (
                    <View style={styles.playBtn}>
                      <Text style={styles.playIcon}>▶</Text>
                    </View>
                  ) : (
                    <Text style={styles.chevron}>›</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    };

    return (
      <FlatList
        ref={ref}
        data={days}
        keyExtractor={item => item.date}
        renderItem={renderDay}
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={[styles.listContent, {paddingBottom: bottomPadding}]}
      />
    );
  },
);
DayList.displayName = 'DayList';

const styles = makeStyles(theme => ({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#999999', // untokenized muted gray
    fontSize: theme.typography.fontSize.lg,
  },
  listContent: {
    paddingHorizontal: theme.spacing[16],
    paddingTop: theme.spacing[12],
    gap: 4,
    paddingBottom: 100,
  },
  // Each day is its own row: a fixed-width date column on the left, and
  // its activity/event cards stacked on the right.
  dayRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing[10],
    gap: theme.spacing[12],
  },
  dayLeftCol: {
    width: 44,
    alignItems: 'center',
    paddingTop: 5,
  },
  dayNumber: {
    fontSize: theme.typography.fontSize.xxxl + 4, // 28 — no exact token
    fontWeight: '800', // no exact token (regular/medium/bold/black only)
    color: '#c7c7c7', // untokenized light gray
  },
  dayNumberToday: {
    color: theme.colors.black,
  },
  dayLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#c7c7c7', // untokenized light gray
    textTransform: 'uppercase',
    marginTop: theme.spacing[2],
    letterSpacing: theme.typography.letterSpacing.wide,
  },
  dayLabelToday: {
    color: theme.colors.black,
  },
  dayCards: {
    flex: 1,
    gap: theme.spacing[8],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5', // untokenized light-gray card
    borderRadius: theme.radii.sm,
    padding: theme.spacing[16],
    paddingHorizontal: theme.spacing[12],
    gap: theme.spacing[10],
    borderWidth: 1,
    borderColor: 'transparent',
  },
  // Past/completed items — same treatment for synced activities and
  // completed calendar events, so both read as "done" the same way.
  rowMuted: {
    backgroundColor: '#f5f5f5',
  },
  // Today's not-yet-done session — the one actionable card, so it gets a
  // solid outline instead of the dashed "just highlighted" one below.
  rowToday: {
    borderWidth: 1,
    borderColor: '#cccccc',
    backgroundColor: theme.colors.surfaceElevated,
  },
  // Whichever day is tapped in the week strip (when it isn't also today).
  rowSelected: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    borderStyle: 'dashed',
  },
  accentDot: {
    width: 5,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  accentDotMuted: {
    backgroundColor: '#cccccc',
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  rowTitleMuted: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: '#999999',
  },
  rowSubtitle: {
    fontSize: theme.typography.fontSize.md,
    color: '#999999',
    marginTop: theme.spacing[2],
  },
  chevron: {
    fontSize: 22,
    color: '#c7c7c7',
    fontWeight: '300', // no exact token (lighter than 'regular' = 400)
  },
  checkIcon: {
    fontSize: theme.typography.fontSize.xl,
    color: '#9CA3AF',
    fontWeight: theme.typography.fontWeight.bold,
  },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.md,
  },
}));
