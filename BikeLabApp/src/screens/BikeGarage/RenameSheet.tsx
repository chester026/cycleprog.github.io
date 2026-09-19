// Extracted from BikeGarageScreen.tsx (screen decomposition, T-5.5 /
// GUIDE-5b): the "rename group/component" modal, shared between group
// headers and individual component cards (see BikeGarageScreen's
// openRename/saveRename).
import React from 'react';
import {Modal, Text, TextInput, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {PrimaryButton} from '../../components/PrimaryButton';
import {makeStyles} from '../../theme';
import type {RenameTarget} from './types';

interface RenameSheetProps {
  target: RenameTarget | null;
  value: string;
  saving: boolean;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export const RenameSheet: React.FC<RenameSheetProps> = ({
  target,
  value,
  saving,
  onChangeValue,
  onClose,
  onSave,
}) => {
  const {t} = useTranslation();

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.centerOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.renameSheet}>
          <Text style={styles.renameTitle}>
            {target?.type === 'group' ? t('bikeGarage.renameGroup') : t('bikeGarage.renameComponent')}
          </Text>
          <Text style={styles.renameHint}>{t('bikeGarage.renameHint')}</Text>
          <TextInput
            style={styles.renameInput}
            value={value}
            onChangeText={onChangeValue}
            placeholder={t('bikeGarage.gearNamePlaceholder')}
            placeholderTextColor="#C7C7CC"
            autoFocus
          />
          <PrimaryButton
            title={t('common.save')}
            onPress={onSave}
            loading={saving}
            disabled={!value.trim()}
            style={styles.renameSaveBtn}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = makeStyles(theme => ({
  centerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[24],
  },
  renameSheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 20,
    padding: theme.spacing[24],
    width: '100%',
  },
  renameTitle: {fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: theme.spacing[6], letterSpacing: -0.3},
  renameHint: {fontSize: theme.typography.fontSize.base, color: '#8E8E93', lineHeight: 18, marginBottom: theme.spacing[16]},
  renameInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[14],
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: theme.spacing[16],
  },
  renameSaveBtn: {paddingVertical: theme.spacing[14]},
}));
