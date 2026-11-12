// Extracted from RideAnalyticsScreen.tsx (T-5.4 screen decomposition):
// the top nav bar — back button, title, refresh button. Pixel-identical
// to the original inline JSX (including the refresh button's fully
// transparent label — that's how the original rendered it too; not fixed
// here since visual behaviour is 1:1 for this refactor).
// `onOpenStrava` adds the "View on Strava" link on the right — the ride
// screen is opened straight from the rides list now, so the way to the
// original activity lives here.
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { makeStyles, withOpacity } from '../../theme';

interface RideHeaderProps {
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  /** Opens the ride on Strava; the link is drawn only when given. */
  onOpenStrava?: () => void;
}

export const RideHeader: React.FC<RideHeaderProps> = ({
  onBack,
  onRefresh,
  refreshing,
  onOpenStrava,
}) => {
  const { t } = useTranslation();

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t('rideAnalytics.title')}</Text>
      {onOpenStrava ? (
        <TouchableOpacity
          onPress={onOpenStrava}
          style={styles.stravaLink}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="ride-open-strava"
        >
          <Text style={styles.stravaLinkText}>
            {t('rideAnalytics.viewOnStrava')}
          </Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={onRefresh}
        style={styles.refreshButton}
        disabled={refreshing}
      >
        <Text style={styles.refreshButtonText}>
          {refreshing ? 'p' : 'refresh'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: theme.spacing[10],
    paddingRight: theme.spacing[16],
    paddingTop: 55,
    paddingBottom: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.text.primary,
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
  stravaLink: {
    paddingVertical: theme.spacing[6],
    paddingHorizontal: theme.spacing[12],
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.strava.brandOrange, 0.5),
  },
  stravaLinkText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.strava.brandOrange,
  },
  // Kept for the refresh gesture; it has no visible label, so it must not
  // push the Strava link off the screen's right gutter.
  refreshButton: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
  refreshButtonText: {
    fontSize: theme.typography.fontSize.xxxl,
    color: 'rgba(255, 255, 255, 0)',
  },
}));
