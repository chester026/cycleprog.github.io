// The workout section of the event sheet (docs/plans/workout-blocks.md): the
// session's profile, and under it what to do in the block the rider tapped —
// its place in the session, how long, at what intensity, and the coach's cue.
// Nothing selected: a one-line summary and a hint to tap.
import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {Workout} from '@bikelab/shared/types';
import {makeStyles, useTheme} from '../../theme';
import {WorkoutProfile} from './WorkoutProfile';
import {
  blockColor,
  blockStartOffsets,
  formatBlockCadence,
  formatBlockDuration,
  formatBlockName,
  formatBlockTarget,
  formatWorkoutClock, formatBlockLength} from './workoutLib';

const PROFILE_HEIGHT = 76;

export const WorkoutBlocks: React.FC<{workout: Workout}> = ({workout}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const {steps} = workout;

  // A different session opened in the same sheet starts with nothing selected.
  useEffect(() => {
    setSelected(null);
  }, [workout]);

  const step = selected !== null ? steps[selected] : null;
  const target = step ? formatBlockTarget(step.target, t) : null;
  const cadence = step ? formatBlockCadence(step.cadence, t) : null;
  const zoneColor = step ? blockColor(step, theme.colors.workoutZones) : undefined;

  return (
    <View style={styles.section} testID="workout-blocks">
      <WorkoutProfile
        steps={steps}
        height={PROFILE_HEIGHT}
        selectedIndex={selected}
        // Tapping the selected block again goes back to the summary.
        onSelect={index => setSelected(current => (current === index ? null : index))}
        testID="workout-profile"
      />

      {step && selected !== null ? (
        <View style={styles.detail} testID="workout-block-detail">
          <View style={styles.detailHead}>
            <View style={[styles.zoneDot, {backgroundColor: zoneColor}]} />
            <Text style={styles.blockName}>{formatBlockName(step, t)}</Text>
            <Text style={styles.blockPosition}>
              {t('calendar.workout.blockOf', {n: selected + 1, total: steps.length})}
            </Text>
          </View>
          <Text style={styles.blockNumbers}>
            {[formatBlockLength(step, t), target, t('calendar.workout.zone', {zone: step.zone})]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text style={styles.blockMeta}>
            {[t('calendar.workout.startsAt', {time: formatWorkoutClock(blockStartOffsets(steps)[selected])}), cadence]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {step.cue ? <Text style={styles.blockCue}>{step.cue}</Text> : null}
        </View>
      ) : (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {t('calendar.workout.summary', {blocks: steps.length, duration: formatBlockDuration(workout.duration_s, t)})}
          </Text>
          <Text style={styles.hint}>{t('calendar.workout.tapHint')}</Text>
        </View>
      )}
    </View>
  );
};

const styles = makeStyles(theme => ({
  section: {marginTop: theme.spacing[16], marginBottom: theme.spacing[8]},

  summary: {marginTop: theme.spacing[12], gap: 2},
  summaryText: {fontSize: 14, fontWeight: '700', color: theme.colors.text.primary},
  hint: {fontSize: 13, color: theme.colors.text.iosMuted},

  detail: {
    marginTop: theme.spacing[12],
    padding: theme.spacing[12],
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.backgroundLight,
    gap: 4,
  },
  detailHead: {flexDirection: 'row', alignItems: 'center', gap: theme.spacing[8]},
  zoneDot: {width: 10, height: 10, borderRadius: 5},
  blockName: {flex: 1, fontSize: 15, fontWeight: '800', color: theme.colors.text.primary},
  blockPosition: {fontSize: 12, fontWeight: '600', color: theme.colors.text.iosMuted},
  blockNumbers: {fontSize: 15, fontWeight: '700', color: theme.colors.text.primary},
  blockMeta: {fontSize: 13, color: theme.colors.text.iosMuted},
  blockCue: {fontSize: 14, lineHeight: 20, color: theme.colors.text.primary, marginTop: 4},
}));
