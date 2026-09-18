// Extracted from RideAnalyticsScreen.tsx (T-5.4 screen decomposition):
// the top nav bar — back button, title, refresh button. Pixel-identical
// to the original inline JSX (including the refresh button's fully
// transparent label — that's how the original rendered it too; not fixed
// here since visual behaviour is 1:1 for this refactor).
import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles} from '../../theme';

interface RideHeaderProps {
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export const RideHeader: React.FC<RideHeaderProps> = ({onBack, onRefresh, refreshing}) => {
  const {t} = useTranslation();

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t('rideAnalytics.title')}</Text>
      <TouchableOpacity onPress={onRefresh} style={styles.refreshButton} disabled={refreshing}>
        <Text style={styles.refreshButtonText}>{refreshing ? 'p' : 'refresh'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[10],
    paddingTop: 55,
    paddingBottom: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    padding: theme.spacing[8],
    marginRight: 0,
  },
  backButtonText: {
    fontSize: theme.typography.fontSize.xxl,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(255, 255, 255, 0.9)',
    flex: 1,
  },
  refreshButton: {
    padding: theme.spacing[8],
  },
  refreshButtonText: {
    fontSize: theme.typography.fontSize.xxxl,
    color: 'rgba(255, 255, 255, 0)',
  },
}));
