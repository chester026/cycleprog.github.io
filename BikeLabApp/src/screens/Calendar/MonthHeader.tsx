// Header ("‹ June 2026 Today ›") — T-5.4/T-5.1, audit A-27. The arrows
// page the week strip by one WEEK (the label names the selected week's
// month); tapping the label jumps back to today.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles} from '../../theme';

interface MonthHeaderProps {
  monthLabel: string;
  topInset: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  // The "Today" link is an action ("take me back"), so it is shown only
  // while the selected day is NOT today — on today it read as a label under
  // the month ("what is today?", owner 09.10.2026).
  showToday: boolean;
}

export const MonthHeader: React.FC<MonthHeaderProps> = ({monthLabel, topInset, onPrevWeek, onNextWeek, onToday, showToday}) => {
  const {t} = useTranslation();

  return (
    <View style={[styles.header, {paddingTop: topInset + 12}]}>
      <TouchableOpacity onPress={onPrevWeek} testID="calendar-prev-week" hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
        <Text style={styles.navArrow}>‹</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onToday} style={styles.monthLabelWrap} disabled={!showToday} testID="calendar-today">
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        {/* Reserve the row so the strip below doesn't jump when it toggles. */}
        <Text style={styles.todayLink}>{showToday ? t('calendar.backToToday') : ' '}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onNextWeek} testID="calendar-next-week" hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
        <Text style={styles.navArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[20],
    paddingTop: theme.spacing[16],
    paddingBottom: theme.spacing[8],
  },
  navArrow: {
    // 26 — no exact token in the fontSize scale (xxxl is 24); kept literal
    // rather than rounding, per the "same pixels as before" rule.
    fontSize: 26,
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeight.regular,
    paddingHorizontal: theme.spacing[8],
    marginTop: theme.spacing[4],
  },
  monthLabelWrap: {
    alignItems: 'center',
    flex: 1,
  },
  monthLabel: {
    fontSize: 26, // see navArrow
    fontWeight: '800', // no exact token (regular/medium/bold/black only)
    color: theme.colors.text.primary,
    textTransform: 'capitalize',
  },
  todayLink: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.accent,
    fontWeight: theme.typography.fontWeight.medium,
    marginTop: theme.spacing[2],
  },
}));
