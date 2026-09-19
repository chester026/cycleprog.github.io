// One checklist item in the section grid. Same card chrome as GridCard
// (BikeGarage's component cards) but without the progress bar — a checklist
// item is binary, so the card is shorter and carries a round check in the
// top-right corner instead, with the title centred against the card's full
// height (owner feedback, 19.09): an outlined circle when open, a green disc
// with a white tick when done, with the title struck through.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import type {ChecklistItem} from '@bikelab/shared/types';
import {makeStyles} from '../../theme';
import {linkHost} from './lib';

export const CHECK_SIZE = 24;

export interface ItemCardProps {
  item: ChecklistItem;
  width: number;
  onPress: () => void;
  onLongPress: () => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({item, width, onPress, onLongPress}) => {
  const done = !!item.checked;
  const host = linkHost(item.link);
  return (
    <TouchableOpacity
      style={[styles.card, {width}]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.6}
      testID={`checklist-item-${item.id}`}
      accessibilityRole="checkbox"
      accessibilityState={{checked: done}}>
      <View style={styles.text}>
        <Text style={[styles.name, done && styles.nameDone]} numberOfLines={2}>
          {item.item}
        </Text>
        {host ? (
          <Text style={styles.host} numberOfLines={1}>
            {host}
          </Text>
        ) : null}
      </View>
      <View
        style={[styles.check, done && styles.checkDone]}
        testID={done ? 'checklist-check-done' : 'checklist-check-open'}>
        {done ? <Text style={styles.tick}>✓</Text> : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = makeStyles(theme => ({
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing[14],
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    justifyContent: 'flex-end',
    minHeight: 84,
  },
  // The check is out of the flow so the title centres against the whole
  // card; this padding keeps a two-line title from running under it.
  text: {paddingRight: CHECK_SIZE + theme.spacing[6]},
  name: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text.primary,
    lineHeight: 17,
  },
  nameDone: {textDecorationLine: 'line-through', color: theme.colors.text.secondary},
  host: {fontSize: 9, color: theme.colors.text.secondary, fontWeight: '500', marginTop: theme.spacing[4]},
  check: {
    position: 'absolute',
    top: theme.spacing[14],
    right: theme.spacing[14],
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: {backgroundColor: theme.colors.successStrong, borderColor: theme.colors.successStrong},
  tick: {color: theme.colors.text.inverse, fontSize: theme.typography.fontSize.md, fontWeight: '800', lineHeight: 18},
}));
