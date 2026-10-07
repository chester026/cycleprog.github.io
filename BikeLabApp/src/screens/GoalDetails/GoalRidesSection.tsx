// "Rides that completed this goal" — the rides attached on completion, plus
// the Reopen action for the completed goal. A ride opens RideAnalytics when
// it's among the synced activities the app already holds.
import React from 'react';
import {useTranslation} from 'react-i18next';
import {Text, TouchableOpacity, View} from 'react-native';
import type {MetaGoalRide} from '@bikelab/shared/types';
import {RideRow} from '../../components/RideRow';
import {makeStyles} from '../../theme';

interface GoalRidesSectionProps {
  rides: MetaGoalRide[];
  onRidePress: (stravaId: number) => void;
  onReopen: () => void;
}

export const GoalRidesSection: React.FC<GoalRidesSectionProps> = ({rides, onRidePress, onReopen}) => {
  const {t} = useTranslation();
  return (
    <View style={styles.section} testID="goal-rides-section">
      <Text style={styles.title}>{t('goalDetails.ridesTitle')}</Text>
      {rides.length === 0 ? (
        <Text style={styles.empty}>{t('goalDetails.noAttachedRides')}</Text>
      ) : (
        rides.map(ride => (
          <RideRow
            key={ride.strava_id}
            ride={{
              name: ride.name ?? '',
              startDate: ride.start_date,
              distanceM: ride.distance ?? 0,
              elevationM: ride.total_elevation_gain ?? 0,
              movingTimeS: ride.moving_time ?? 0,
            }}
            onPress={() => onRidePress(ride.strava_id)}
            testID={`goal-ride-${ride.strava_id}`}
          />
        ))
      )}
      <TouchableOpacity testID="goal-reopen" style={styles.reopenBtn} onPress={onReopen}>
        <Text style={styles.reopenText}>{t('goalDetails.reopen')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  section: {
    paddingHorizontal: theme.spacing[16],
    marginTop: theme.spacing[24],
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[8],
  },
  empty: {
    fontSize: 14,
    color: theme.colors.text.faint,
    paddingVertical: theme.spacing[8],
  },
  reopenBtn: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing[12],
  },
  reopenText: {
    fontSize: 14,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.muted,
    textDecorationLine: 'underline',
  },
}));
