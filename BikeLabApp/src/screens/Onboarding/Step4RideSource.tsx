// Last onboarding step: where the rides come from (docs/plans/
// auth-providers.md §4.1). Sign-in no longer implies Strava, so a new rider
// is offered to connect it here — or to finish without it and do it later
// from the Garage card. Strava is the one source the app reads rides from
// today; Garmin joins this list when riders can link it themselves.
import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity} from 'react-native';
import {startStravaLink} from '../../auth/strava';
import {handleStravaLinkResult} from '../../auth/stravaLinkResult';
import {useStravaStatus} from '../../data/hooks/useStravaStatus';
import {logger} from '../../lib/logger';
import {onboardingStepStyles as styles} from './styles';

export const Step4RideSource: React.FC = () => {
  const {t} = useTranslation();
  const {status} = useStravaStatus();

  const handleConnect = async () => {
    try {
      await startStravaLink();
    } catch (error) {
      logger.error('Failed to start Strava link from onboarding:', error);
      handleStravaLinkResult({ok: false});
    }
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('onboarding.rideSourceTitle')}</Text>
      <Text style={styles.stepDescription}>{t('onboarding.rideSourceHint')}</Text>

      <View style={[styles.experienceCard, status.connected && styles.experienceCardActive]}>
        <Text style={styles.experienceLabel}>{t('onboarding.rideSourceStrava')}</Text>
        <Text style={styles.rideSourceDescription}>
          {status.connected ? t('onboarding.rideSourceConnected') : t('onboarding.rideSourceStravaDesc')}
        </Text>
        {status.connected ? null : (
          <TouchableOpacity style={styles.rideSourceButton} onPress={handleConnect} testID="onboarding-connect-strava">
            <Text style={styles.rideSourceButtonText}>{t('strava.connect')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {status.connected ? null : <Text style={styles.stepDescription}>{t('onboarding.rideSourceLater')}</Text>}
    </View>
  );
};
