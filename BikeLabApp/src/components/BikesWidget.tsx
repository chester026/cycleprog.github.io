import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity} from 'react-native';
import type {Bike} from '@bikelab/shared/types';
import {useAppNavigation} from '../navigation/hooks';
import {makeStyles} from '../theme';

interface BikesWidgetProps {
  bikes: Bike[];
}

export const BikesWidget: React.FC<BikesWidgetProps> = ({bikes}) => {
  const {t} = useTranslation();
  const navigation = useAppNavigation();

  if (bikes.length === 0) {
    return null;
  }

  const primaryBike = bikes.find(b => b.primary) || bikes[0];

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('BikeGarage', {bikeId: primaryBike.id})}>
      <View style={styles.bikeInfoContainer}>
        <View style={styles.primaryBadge}>
          <Text style={styles.primaryBadgeText}>{t('common.primary')}</Text>
        </View>

        <Text style={styles.bikeName}>
          {primaryBike.brand_name && primaryBike.model_name
            ? `${primaryBike.brand_name} ${primaryBike.model_name}`
            : primaryBike.name}
        </Text>
      </View>

      {bikes.length > 1 && (
        <View style={styles.seeAllBtn}>
          <Text style={styles.seeAllText}>{t('bikes.allBikes')}</Text>
        </View>
      )}

      <View style={styles.distanceContainer}>
        {primaryBike.activitiesCount > 0 && (
          <Text style={styles.bikeActivities}>
            {primaryBike.activitiesCount} {t('common.rides')}
          </Text>
        )}
        <View style={styles.distanceValueContainer}>
          <Text style={styles.distanceValue}>
            {primaryBike.distanceKm.toLocaleString()}
          </Text>
          <Text style={styles.distanceUnit}>{t('common.km')}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = makeStyles(theme => ({
  container: {
    width: 220,
    height: 270,
    backgroundColor: theme.colors.speedWidget.cardBg,
    padding: 16,
    paddingVertical: 20,
    marginRight: 8,
    position: 'relative',
    justifyContent: 'space-between',
    borderRadius: 16,
  },
  primaryBadge: {
    backgroundColor: theme.colors.accent,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  primaryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  bikeName: {
    fontSize: 25,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: 4,
    lineHeight: 32,
  },
  bikeActivities: {
    fontSize: 14,
    color: theme.colors.text.muted,
    marginBottom: 4,
    fontWeight: '700',
  },
  bikeInfoContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  distanceContainer: {
    flexDirection: 'column',
    alignItems: 'baseline',
    marginBottom: 0,
    justifyContent: 'space-between',
  },
  distanceValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  distanceValue: {
    fontSize: 30,
    fontWeight: '900',
    color: theme.colors.text.primary,
    letterSpacing: -1,
  },
  distanceUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.faint,
    marginLeft: 4,
  },
  seeAllBtn: {
    position: 'absolute',
    right: 16,
    top: 12,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.bikesWidgetLink,
  },
}));
