// Mon..Sun preview strip under the month header — a separate fixed row,
// not part of the scrolling day list below it (T-5.4/T-5.1, audit A-27).
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {makeStyles} from '../../theme';
import {fmtDate} from './lib';

interface WeekStripProps {
  days: Date[];
  selectedDate: string;
  datesWithContent: Set<string>;
  locale: string;
  onSelectDay: (dateStr: string) => void;
}

export const WeekStrip: React.FC<WeekStripProps> = ({days, selectedDate, datesWithContent, locale, onSelectDay}) => {
  return (
    <View style={styles.weekStrip}>
      {days.map(d => {
        const dateStr = fmtDate(d);
        const isSelected = dateStr === selectedDate;
        const hasContent = datesWithContent.has(dateStr);
        return (
          <TouchableOpacity
            key={dateStr}
            style={styles.weekDayCol}
            onPress={() => onSelectDay(dateStr)}
            activeOpacity={0.7}>
            <Text style={styles.weekDayLabel}>{d.toLocaleDateString(locale, {weekday: 'short'})}</Text>
            <View style={[styles.weekDayCircle, isSelected && styles.weekDayCircleSelected]}>
              <Text style={[styles.weekDayNumber, isSelected && styles.weekDayNumberSelected]}>{d.getDate()}</Text>
            </View>
            {/* Always rendered (transparent when the day has nothing) so
                days with and without a dot line up at the same height. */}
            <View style={[styles.weekDayDot, hasContent && styles.weekDayDotVisible]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = makeStyles(theme => ({
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[16],
    paddingTop: theme.spacing[12],
    paddingBottom: 14, // no exact spacing token (12/16 bracket it)
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.hairline,
  },
  weekDayCol: {
    alignItems: 'center',
    width: 40,
  },
  weekDayLabel: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.faint,
    fontWeight: theme.typography.fontWeight.bold,
    textTransform: 'capitalize',
    marginBottom: theme.spacing[6],
  },
  weekDayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayCircleSelected: {
    backgroundColor: theme.colors.calendar.nearBlackFill,
  },
  weekDayNumber: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  weekDayNumberSelected: {
    color: theme.colors.text.inverse,
  },
  weekDayDot: {
    width: 6,
    height: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
    marginTop: theme.spacing[6],
  },
  weekDayDotVisible: {
    backgroundColor: theme.colors.accent,
  },
}));
