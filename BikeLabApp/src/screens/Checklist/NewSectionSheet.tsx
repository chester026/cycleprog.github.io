// "New section" modal, opened from the pinned pill at the bottom of the
// Checklist screen (owner request, 19.09) — same FormSheet chrome
// as every other checklist edit. A section can't exist without at least one
// item, same as the ported web behaviour this screen replaced, so it takes
// both the section name and its first item.
import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {FormSheet} from '../../components/FormSheet';

export interface NewSectionSheetProps {
  visible: boolean;
  saving: boolean;
  onClose: () => void;
  onAdd: (section: string, item: string) => void;
}

export const NewSectionSheet: React.FC<NewSectionSheetProps> = ({visible, saving, onClose, onAdd}) => {
  const {t} = useTranslation();
  const [section, setSection] = useState('');
  const [item, setItem] = useState('');

  const reset = () => {
    setSection('');
    setItem('');
  };

  const submit = () => {
    const s = section.trim();
    const i = item.trim();
    if (!s || !i) return;
    onAdd(s, i);
    reset();
  };

  return (
    <FormSheet
      visible={visible}
      title={t('checklist.addSection')}
      subtitle={t('checklist.addSectionHint')}
      fields={[
        {
          key: 'section',
          value: section,
          onChangeValue: setSection,
          placeholder: t('checklist.sectionNamePlaceholder'),
        },
        {
          key: 'item',
          value: item,
          onChangeValue: setItem,
          placeholder: t('checklist.firstItemPlaceholder'),
        },
      ]}
      primaryLabel={t('checklist.add')}
      onPrimaryPress={submit}
      primaryDisabled={!section.trim() || !item.trim()}
      primaryLoading={saving}
      onClose={() => {
        reset();
        onClose();
      }}
    />
  );
};
