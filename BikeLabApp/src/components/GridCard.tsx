// A light-grey rounded card for a 3-column grid: bold title, a thin
// progress bar and a bottom row of a muted sub-label + a bold value —
// shared between BikeGarage's component cards and the Checklist screen's
// item/section cards (owner request: redesign Checklist in BikeGarage's
// visual language). Styles are copied 1:1 from the card
// BikeGarage/ComponentsGrid.tsx used to render inline, so extracting this
// didn't change BikeGarage's pixels.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {makeStyles} from '../theme';

export interface GridCardProps {
  title: string;
  width: number;
  /** 0-100, drives the progress bar fill. */
  percent: number;
  barColor: string;
  subLabel: string;
  valueLabel: string;
  /** Small colored dot next to the title (e.g. "needs attention"). */
  dotColor?: string;
  /** Dims the whole card (e.g. a completed/checked item). */
  muted?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
}

export const GridCard: React.FC<GridCardProps> = ({
  title,
  width,
  percent,
  barColor,
  subLabel,
  valueLabel,
  dotColor,
  muted,
  onPress,
  onLongPress,
  testID,
}) => (
  <TouchableOpacity
    style={[styles.card, {width}, muted && styles.cardMuted]}
    onPress={onPress}
    onLongPress={onLongPress}
    activeOpacity={0.6}
    testID={testID}>
    <View style={styles.nameRow}>
      <Text style={[styles.name, muted && styles.nameMuted]} numberOfLines={2}>
        {title}
      </Text>
      {dotColor ? <View style={[styles.dot, {backgroundColor: dotColor}]} /> : null}
    </View>
    <View style={styles.footer}>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, {width: `${percent}%`, backgroundColor: barColor}]} />
      </View>
      <View style={styles.bottom}>
        <Text style={styles.sub} numberOfLines={1}>
          {subLabel}
        </Text>
        <Text style={styles.value}>{valueLabel}</Text>
      </View>
    </View>
  </TouchableOpacity>
);

const styles = makeStyles(theme => ({
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing[14],
    paddingBottom: theme.spacing[14],
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    justifyContent: 'space-between',
    minHeight: 100,
  },
  cardMuted: {opacity: 0.55},
  nameRow: {flexDirection: 'row', alignItems: 'center', gap: theme.spacing[6]},
  name: {fontSize: theme.typography.fontSize.lg, fontWeight: '700', color: theme.colors.text.primary, lineHeight: 17, flexShrink: 1, flex: 1},
  nameMuted: {textDecorationLine: 'line-through', color: theme.colors.text.iosMuted},
  dot: {width: 7, height: 7, borderRadius: 4},
  footer: {marginTop: theme.spacing[8]},
  barTrack: {height: 5, backgroundColor: theme.colors.garage.barTrack, overflow: 'hidden', marginBottom: theme.spacing[6]},
  barFill: {height: '100%'},
  bottom: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sub: {fontSize: 9, color: theme.colors.text.iosMuted, fontWeight: '500', flexShrink: 1, marginRight: theme.spacing[4]},
  value: {fontSize: theme.typography.fontSize.md, fontWeight: '800', letterSpacing: -0.2, color: theme.colors.text.primary},
}));
