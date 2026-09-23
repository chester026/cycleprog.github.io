// Section rename/delete sheet, opened from a section header's pencil — a
// thin wrapper around FormSheet, the one modal chrome every checklist edit
// uses (owner request: redesign Checklist in BikeGarage's visual language).
import React from 'react';
import {Alert} from 'react-native';
import {useTranslation} from 'react-i18next';
import {FormSheet} from '../../components/FormSheet';
import type {ChecklistSection} from './lib';

export interface SectionSheetProps {
  section: ChecklistSection | null;
  value: string;
  saving: boolean;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export const SectionSheet: React.FC<SectionSheetProps> = ({
  section,
  value,
  saving,
  onChangeValue,
  onClose,
  onSave,
  onDelete,
}) => {
  const {t} = useTranslation();

  const confirmDelete = () => {
    if (!section) return;
    Alert.alert(
      t('checklist.deleteSectionTitle', {section: section.section}),
      t('checklist.deleteSectionMessage', {done: section.done, total: section.total}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('common.delete'), style: 'destructive', onPress: onDelete},
      ],
    );
  };

  return (
    <FormSheet
      visible={!!section}
      title={t('checklist.renameSection')}
      subtitle={t('checklist.renameSectionHint')}
      fields={[
        {
          key: 'name',
          value,
          onChangeValue,
          placeholder: t('checklist.sectionNamePlaceholder'),
        },
      ]}
      primaryLabel={t('common.save')}
      onPrimaryPress={onSave}
      primaryDisabled={!value.trim()}
      primaryLoading={saving}
      onClose={onClose}
      destructiveLabel={section ? t('checklist.deleteSection') : undefined}
      onDestructivePress={confirmDelete}
    />
  );
};
