// Sheet for a long-pressed checklist item card — rename, move to another
// section, edit/open its link, delete. Same ChecklistFormSheet chrome as
// every other checklist edit (owner request: one modal style for the whole
// screen), with the open-link row and move-to-section chips as extra
// content between the fields and the primary "Save changes" button.
import React, {useEffect, useState} from 'react';
import {Linking, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {ChecklistItem} from '@bikelab/shared/types';
import {makeStyles} from '../../theme';
import {ChecklistFormSheet} from './ChecklistFormSheet';

export interface ItemDetailSheetProps {
  item: ChecklistItem | null;
  otherSections: string[];
  saving: boolean;
  onClose: () => void;
  onRename: (text: string) => void;
  onMove: (section: string) => void;
  onSaveLink: (link: string) => void;
  onDelete: () => void;
}

export const ItemDetailSheet: React.FC<ItemDetailSheetProps> = ({
  item,
  otherSections,
  saving,
  onClose,
  onRename,
  onMove,
  onSaveLink,
  onDelete,
}) => {
  const {t} = useTranslation();
  const [name, setName] = useState('');
  const [link, setLink] = useState('');

  // Re-seed the inputs whenever a *different* item is opened (id changes) —
  // not on every `item` prop change, since a successful save updates
  // `item.item`/`item.link` from the query cache and would otherwise stomp
  // on further edits the user is mid-typing.
  useEffect(() => {
    setName(item?.item ?? '');
    setLink(item?.link ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) return null;

  const trimmedName = name.trim();
  const trimmedLink = link.trim();
  const nameChanged = !!trimmedName && trimmedName !== item.item;
  const linkChanged = trimmedLink !== (item.link ?? '');

  const save = () => {
    if (nameChanged) onRename(trimmedName);
    if (linkChanged) onSaveLink(trimmedLink);
    if (!nameChanged && !linkChanged) onClose();
  };

  return (
    <ChecklistFormSheet
      visible={!!item}
      title={item.item}
      fields={[
        {
          key: 'name',
          label: t('checklist.itemName'),
          value: name,
          onChangeValue: setName,
        },
        {
          key: 'link',
          label: t('checklist.itemLink'),
          value: link,
          onChangeValue: setLink,
          placeholder: t('checklist.itemLinkPlaceholder'),
          autoCapitalize: 'none',
          keyboardType: 'url',
        },
      ]}
      primaryLabel={t('common.save')}
      onPrimaryPress={save}
      primaryDisabled={!trimmedName}
      primaryLoading={saving}
      onClose={onClose}
      destructiveLabel={t('checklist.deleteItem')}
      onDestructivePress={onDelete}>
      {!!item.link && (
        <TouchableOpacity onPress={() => Linking.openURL(item.link!)}>
          <Text style={styles.openLink}>{t('checklist.openLink')}</Text>
        </TouchableOpacity>
      )}

      {otherSections.length > 0 && (
        <>
          <Text style={styles.label}>{t('checklist.moveToSection')}</Text>
          <View style={styles.chipRow}>
            {otherSections.map(section => (
              <TouchableOpacity key={section} style={styles.chip} onPress={() => onMove(section)}>
                <Text style={styles.chipText}>{section}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </ChecklistFormSheet>
  );
};

const styles = makeStyles(theme => ({
  label: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing[8],
    marginTop: theme.spacing[4],
  },
  openLink: {color: theme.colors.accent, fontSize: theme.typography.fontSize.base, marginBottom: theme.spacing[8]},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8], marginBottom: theme.spacing[8]},
  chip: {
    backgroundColor: '#F5F5F5',
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing[14],
    paddingVertical: theme.spacing[8],
  },
  chipText: {fontSize: theme.typography.fontSize.base, fontWeight: '600', color: '#1A1A1A'},
}));
