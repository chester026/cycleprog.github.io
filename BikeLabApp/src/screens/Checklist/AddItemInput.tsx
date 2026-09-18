// "Add new item" row for a section — ported "as is" from ChecklistPage.jsx's
// per-section `<form>` (text input + submit button, Enter/press to add).
import React, {useState} from 'react';
import {View, TextInput, TouchableOpacity, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, useTheme} from '../../theme';

export interface AddItemInputProps {
  onAdd: (text: string) => void;
  placeholder?: string;
}

export const AddItemInput: React.FC<AddItemInputProps> = ({onAdd, placeholder}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
  };

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder ?? t('checklist.addItemPlaceholder')}
        placeholderTextColor={theme.colors.text.muted}
        onSubmitEditing={submit}
        returnKeyType="done"
      />
      <TouchableOpacity style={styles.addButton} onPress={submit} accessibilityLabel={t('checklist.add')}>
        <Text style={styles.addButtonText}>{t('checklist.add')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    marginBottom: theme.spacing[12],
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[8],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  addButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing[14],
    paddingVertical: theme.spacing[8],
  },
  addButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.fontWeight.medium,
    fontSize: theme.typography.fontSize.base,
  },
}));
