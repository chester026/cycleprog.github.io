// One ride in a list: name + "date · km · m up · duration", optionally with a
// selection checkbox. Shared by the multi-select ActivityPickerModal (coach
// attachments, complete-goal sheet) and the goal screen's attached-rides list.
import React from 'react';
import {useTranslation} from 'react-i18next';
import {Text, TouchableOpacity, View} from 'react-native';
import {getDateLocale} from '../i18n/dateLocale';
import {makeStyles, withOpacity} from '../theme';

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

export interface RideRowData {
  name: string;
  startDate: string | Date | null;
  distanceM: number;
  elevationM: number;
  movingTimeS: number;
}

export function formatRideRowMeta(ride: Omit<RideRowData, 'name'>) {
  const date = ride.startDate
    ? new Date(ride.startDate).toLocaleDateString(getDateLocale(), {month: 'short', day: 'numeric'})
    : '';
  const hours = Math.floor(ride.movingTimeS / SECONDS_PER_HOUR);
  const mins = Math.floor((ride.movingTimeS % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return {
    date,
    distance: (ride.distanceM / 1000).toFixed(1),
    elevation: Math.round(ride.elevationM),
    duration: hours > 0 ? `${hours}h${mins}m` : `${mins}m`,
  };
}

export const RideRow: React.FC<{
  ride: RideRowData;
  /** Omit for a plain list; true/false renders the checkbox. */
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}> = ({ride, selected, onPress, testID}) => {
  const {t} = useTranslation();
  const content = (
    <>
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {ride.name}
        </Text>
        <Text style={styles.meta}>{t('rideRow.meta', formatRideRowMeta(ride))}</Text>
      </View>
      {selected === undefined ? null : (
        <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
          {selected ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
      )}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7} testID={testID}>
      {content}
    </TouchableOpacity>
  );
};

const styles = makeStyles(theme => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  main: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: 2,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.text.muted,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: withOpacity(theme.colors.black, 0.2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  checkmark: {
    color: theme.colors.text.inverse,
    fontSize: 13,
    fontWeight: '700',
  },
}));
