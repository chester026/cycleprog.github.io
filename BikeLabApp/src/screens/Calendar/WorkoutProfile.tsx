// A workout drawn as its blocks (docs/plans/workout-blocks.md): one bar per
// block, as wide as the block is long and as tall as it is hard — the picture
// every structured-workout tool uses, because a rider reads "warm-up, three
// efforts with rests, cool-down" off it at a glance.
//
// Colour is kept for the work: efforts and steady riding carry their zone's
// colour, fading downwards; warm-up, recovery and cool-down are flat grey
// (workoutLib.blockColor).
//
// Two uses, one component:
//   - the calendar's day row: not interactive (`onSelect` omitted);
//   - the event sheet: taller, each block tappable; the selected one stays
//     solid and the rest fade so it is obvious which block the text below is
//     about.
import React from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type {WorkoutStep} from '@bikelab/shared/types';
import {makeStyles, useTheme} from '../../theme';
import {blockColor, blockHeightFraction, isEffortBlock} from './workoutLib';

interface WorkoutProfileProps {
  steps: readonly WorkoutStep[];
  /** Height of the tallest possible block (zone 7), px. */
  height: number;
  selectedIndex?: number | null;
  onSelect?: (index: number) => void;
  /** A finished session: the same shape, greyed. */
  muted?: boolean;
  testID?: string;
}

/** Corner radius of a block: rounder on the tall profile, never more than the lowest block can take. */
export const blockRadius = (height: number): number => Math.max(4, Math.min(8, Math.round(height / 7)));

export const WorkoutProfile: React.FC<WorkoutProfileProps> = ({steps, height, selectedIndex = null, onSelect, muted = false, testID}) => {
  const theme = useTheme();
  const zones = theme.colors.workoutZones;
  const borderRadius = blockRadius(height);

  return (
    <View style={[styles.profile, {height}]} testID={testID}>
      {steps.map((step, index) => {
        const blockStyle = [
          styles.block,
          {
            // Width by duration. flexBasis 0 so only the ratio counts; the
            // minimum keeps a 15-second sprint visible next to an hour of Z2.
            flexGrow: step.duration_s,
            height: Math.round(height * blockHeightFraction(step.zone)),
            borderRadius,
            backgroundColor: muted ? theme.colors.calendar.dateMuted : blockColor(step, zones),
          },
          selectedIndex !== null && selectedIndex !== index && styles.blockFaded,
        ];
        // The colour is the block's own background; the fade is a white veil
        // over its lower part, so it needs no second tone per zone.
        const fade =
          !muted && isEffortBlock(step) ? (
            <LinearGradient colors={[...theme.colors.workoutBlockFade]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          ) : null;
        if (!onSelect) {
          return (
            <View key={index} style={blockStyle}>
              {fade}
            </View>
          );
        }
        return (
          <TouchableOpacity
            key={index}
            style={blockStyle}
            activeOpacity={0.7}
            onPress={() => onSelect(index)}
            // Short blocks are a few points wide: the touch target reaches
            // the full height of the profile and a little past the sides.
            hitSlop={{top: height, bottom: 8, left: 2, right: 2}}
            accessibilityRole="button"
            accessibilityState={{selected: selectedIndex === index}}
            testID={testID ? `${testID}-block-${index}` : undefined}>
            {fade}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = makeStyles(() => ({
  profile: {flexDirection: 'row', alignItems: 'flex-end', gap: 3},
  block: {flexBasis: 0, minWidth: 4, overflow: 'hidden'},
  blockFaded: {opacity: 0.3},
}));
