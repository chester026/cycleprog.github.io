/**
 * ExportBar - the two share/save action buttons at the bottom of the
 * Share Studio modal, extracted out of `ShareStudioModal.tsx` (T-5.4).
 */
import React from 'react';
import {View, Text, TouchableOpacity, ActivityIndicator, Platform} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, useTheme, withOpacity} from '../../theme';

interface ExportBarProps {
  isProcessing: boolean;
  onShareToStories: () => void;
  onSaveToPhotos: () => void;
}

export const ExportBar: React.FC<ExportBarProps> = ({isProcessing, onShareToStories, onSaveToPhotos}) => {
  const {t} = useTranslation();
  const theme = useTheme();

  return (
    <View style={styles.actionsContainer}>
      <TouchableOpacity
        style={[styles.actionButton, styles.storiesButton]}
        onPress={onShareToStories}
        disabled={isProcessing}
        activeOpacity={0.8}>
        {isProcessing ? (
          <ActivityIndicator color={theme.colors.text.inverse} size="small" />
        ) : (
          <Text style={styles.actionButtonText}>{t('shareStudio.shareInstagram')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.saveButton]}
        onPress={onSaveToPhotos}
        disabled={isProcessing}
        activeOpacity={0.8}>
        {isProcessing ? (
          <ActivityIndicator color={theme.colors.text.inverse} size="small" />
        ) : (
          <Text style={styles.actionButtonText}>{t('shareStudio.saveToPhotos')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  actionsContainer: {
    flexDirection: 'row',
    padding: 8,
    gap: 12,
    // #222 has no theme token yet (see src/theme/README.md's raw-color
    // inventory) — left as the pre-existing literal.
    backgroundColor: '#222',
    borderTopWidth: 1,
    borderTopColor: withOpacity(theme.colors.text.inverse, 0.1),
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 8,
  },
  storiesButton: {
    backgroundColor: 'transparent',
  },
  saveButton: {
    backgroundColor: 'transparent',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text.inverse,
  },
}));
