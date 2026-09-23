// Extracted from BikeGarageScreen.tsx (screen decomposition, T-5.5 /
// GUIDE-5b). Only rendered by the screen when there's more than one bike.
import React from 'react';
import {ScrollView, Text, TouchableOpacity} from 'react-native';
import type {Bike} from '@bikelab/shared/types';
import {makeStyles} from '../../theme';
import {bikeDisplayName} from './lib';

interface BikeSelectorPillsProps {
  bikes: Bike[];
  selectedBikeId: string | null;
  onSelect: (bikeId: string) => void;
}

export const BikeSelectorPills: React.FC<BikeSelectorPillsProps> = ({
  bikes,
  selectedBikeId,
  onSelect,
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
    {bikes.map(bike => {
      const active = bike.id === selectedBikeId;
      return (
        <TouchableOpacity
          key={bike.id}
          style={[styles.pill, active && styles.pillActive]}
          onPress={() => onSelect(bike.id)}>
          <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
            {bikeDisplayName(bike)}
          </Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

const styles = makeStyles(theme => ({
  pills: {paddingVertical: theme.spacing[6], gap: theme.spacing[8]},
  pill: {
    paddingHorizontal: theme.spacing[14],
    paddingVertical: 7,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.garage.pillBorder,
  },
  pillActive: {backgroundColor: theme.colors.text.primary, borderColor: theme.colors.text.primary},
  pillText: {fontSize: theme.typography.fontSize.base, fontWeight: '500', color: theme.colors.text.iosMuted},
  pillTextActive: {color: theme.colors.text.inverse},
}));
