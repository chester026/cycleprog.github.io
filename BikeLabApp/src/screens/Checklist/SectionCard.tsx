// One checklist section card — title + progress + item rows + add-item
// input + delete-section button. Ported "as is" from ChecklistPage.jsx's
// `renderSection` (progress circle -> a plain percent label here, owner
// will restyle later).
import React from 'react';
import {View, Text, TouchableOpacity, Alert} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {ChecklistItem} from '@bikelab/shared/types';
import {makeStyles, useTheme} from '../../theme';
import {sortSectionItems, type ChecklistSection} from './lib';
import {ItemRow} from './ItemRow';
import {AddItemInput} from './AddItemInput';

export interface SectionCardProps {
  section: ChecklistSection;
  onToggleItem: (item: ChecklistItem) => void;
  onDeleteItem: (item: ChecklistItem) => void;
  onAddItem: (section: string, text: string) => void;
  onDeleteSection: (section: string, itemCount: number, checkedCount: number) => void;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  section,
  onToggleItem,
  onDeleteItem,
  onAddItem,
  onDeleteSection,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const sorted = sortSectionItems(section.items);

  const confirmDeleteSection = () => {
    Alert.alert(
      t('checklist.deleteSectionTitle', {section: section.section}),
      t('checklist.deleteSectionMessage', {done: section.done, total: section.total}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => onDeleteSection(section.section, section.total, section.done),
        },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{section.section}</Text>
        <Text style={styles.progress}>
          {section.done}/{section.total} · {section.percent}%
        </Text>
        <TouchableOpacity
          style={styles.deleteSectionButton}
          onPress={confirmDeleteSection}
          accessibilityLabel={t('checklist.deleteSection')}>
          <Text style={[styles.deleteSectionIcon, {color: theme.colors.danger}]}>🗑</Text>
        </TouchableOpacity>
      </View>

      <AddItemInput onAdd={text => onAddItem(section.section, text)} />

      {sorted.map(item => (
        <ItemRow key={item.id} item={item} onToggle={onToggleItem} onDelete={onDeleteItem} />
      ))}
    </View>
  );
};

const styles = makeStyles(theme => ({
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.md,
    padding: theme.spacing[16],
    marginHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[16],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    marginBottom: theme.spacing[12],
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    flexShrink: 1,
  },
  progress: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
  },
  deleteSectionButton: {
    marginLeft: 'auto',
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
  },
  deleteSectionIcon: {
    fontSize: theme.typography.fontSize.xl,
  },
}));
