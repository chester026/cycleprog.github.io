// A single checklist row — checkbox + label + trash icon. Ported "as is"
// from ChecklistPage.jsx's `<li className="checklist-item">` (owner will
// restyle later); the web's optional link-edit popover is intentionally
// left out here — nothing in the task asked for it on the item row beyond
// what the data layer already supports.
import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {ChecklistItem} from '@bikelab/shared/types';
import {makeStyles, useTheme} from '../../theme';

export interface ItemRowProps {
  item: ChecklistItem;
  onToggle: (item: ChecklistItem) => void;
  onDelete: (item: ChecklistItem) => void;
}

export const ItemRow: React.FC<ItemRowProps> = ({item, onToggle, onDelete}) => {
  const {t} = useTranslation();
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.checkArea}
        onPress={() => onToggle(item)}
        accessibilityRole="checkbox"
        accessibilityState={{checked: !!item.checked}}
        accessibilityLabel={item.item}>
        <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
          {item.checked && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={[styles.label, item.checked && styles.labelChecked]}>{item.item}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => onDelete(item)}
        accessibilityLabel={t('checklist.deleteItem')}>
        <Text style={[styles.deleteIcon, {color: theme.colors.danger}]}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[8],
  },
  checkArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[10],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.radii.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
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
    fontWeight: theme.typography.fontWeight.bold,
  },
  label: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  labelChecked: {
    textDecorationLine: 'line-through',
    color: theme.colors.text.muted,
  },
  deleteButton: {
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
  },
  deleteIcon: {
    fontSize: theme.typography.fontSize.base,
  },
}));
