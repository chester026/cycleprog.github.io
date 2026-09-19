// "New item" modal, opened from a section's dashed "+ New item" card —
// same ChecklistFormSheet chrome as every other checklist edit (owner
// request, 19.09).
import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ChecklistFormSheet} from './ChecklistFormSheet';

export interface NewItemSheetProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (text: string) => void;
}

export const NewItemSheet: React.FC<NewItemSheetProps> = ({visible, onClose, onAdd}) => {
  const {t} = useTranslation();
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
  };

  return (
    <ChecklistFormSheet
      visible={visible}
      title={t('checklist.newItem')}
      fields={[
        {
          key: 'item',
          value: text,
          onChangeValue: setText,
          placeholder: t('checklist.addItemPlaceholder'),
        },
      ]}
      primaryLabel={t('checklist.add')}
      onPrimaryPress={submit}
      primaryDisabled={!text.trim()}
      onClose={() => {
        setText('');
        onClose();
      }}
    />
  );
};
