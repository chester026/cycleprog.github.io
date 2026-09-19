// One checklist section, in BikeGarage's visual language: an uppercase
// letter-spaced header with a pencil (rename/delete), then a 3-column grid
// of item cards (ItemCard: centred title with a round check in the corner).
// A trailing grey "+ New item" card opens the New item modal scoped to
// this section.
import React, {useState} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {ChecklistItem} from '@bikelab/shared/types';
import {SectionHeader} from '../../components/SectionHeader';
import {makeStyles} from '../../theme';
import {CARD_GAP} from '../BikeGarage/lib';
import {sortSectionItems, type ChecklistSection} from './lib';
import {ItemCard} from './ItemCard';
import {NewItemSheet} from './NewItemSheet';

export interface SectionGridProps {
  section: ChecklistSection;
  cardWidth: number;
  onToggleItem: (item: ChecklistItem) => void;
  onLongPressItem: (item: ChecklistItem) => void;
  onAddItem: (section: string, text: string) => void;
  onEditSection: () => void;
}

export const SectionGrid: React.FC<SectionGridProps> = ({
  section,
  cardWidth,
  onToggleItem,
  onLongPressItem,
  onAddItem,
  onEditSection,
}) => {
  const {t} = useTranslation();
  const [addingItem, setAddingItem] = useState(false);
  const sorted = sortSectionItems(section.items);

  return (
    <View>
      <SectionHeader title={section.section.toUpperCase()} onEdit={onEditSection} />
      <View style={styles.grid}>
        {sorted.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            width={cardWidth}
            onPress={() => onToggleItem(item)}
            onLongPress={() => onLongPressItem(item)}
          />
        ))}

        <TouchableOpacity
          testID="checklist-add-item"
          style={[styles.addCard, {width: cardWidth}]}
          onPress={() => setAddingItem(true)}
          activeOpacity={0.6}>
          <Text style={styles.addPlus}>+</Text>
          <Text style={styles.addLabel}>{t('checklist.newItem')}</Text>
        </TouchableOpacity>
      </View>

      <NewItemSheet
        visible={addingItem}
        onClose={() => setAddingItem(false)}
        onAdd={text => {
          onAddItem(section.section, text);
          setAddingItem(false);
        }}
      />
    </View>
  );
};

const styles = makeStyles(theme => ({
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP},
  // Filled grey card with a grey plus, same as ChecklistPreview's trailing
  // "+ New item" card — a dashed outline made it shout louder than the
  // items it sits next to (owner feedback, 19.09).
  addCard: {
    minHeight: 84,
    borderRadius: theme.radii.md,
    backgroundColor: '#f1f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlus: {fontSize: theme.typography.fontSize.xxl, color: '#CCCCCC', fontWeight: '700'},
  addLabel: {fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, marginTop: theme.spacing[4]},
}));
