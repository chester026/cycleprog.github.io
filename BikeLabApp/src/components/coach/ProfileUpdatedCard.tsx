import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Path} from 'react-native-svg';
import {ACCENT, CoachCard, Eyebrow, IconTile} from './CoachCardChrome';
import {makeStyles} from '../../theme';

// Shown inline in the chat when the coach's update_rider_profile tool call
// succeeds (server tools, coach-memory wave) — `updated` is the tool's
// result object itself (`{weight?, height?, birth_date?, age?, max_hr?, …}`,
// see aiCoach.js's executor), only the keys the coach actually changed are
// present. Same card family as ChecklistUpdatedCard/GoalCreatedCard, no
// footer link (no single screen to jump to — the fields live across several
// Profile screens).
const FIELD_SPECS: Record<string, {labelKey: string; unit?: 'kg' | 'cm' | 'bpm' | 'years'}> = {
  weight: {labelKey: 'coach.profileFieldWeight', unit: 'kg'},
  height: {labelKey: 'coach.profileFieldHeight', unit: 'cm'},
  bike_weight: {labelKey: 'coach.profileFieldBikeWeight', unit: 'kg'},
  max_hr: {labelKey: 'coach.profileFieldMaxHr', unit: 'bpm'},
  resting_hr: {labelKey: 'coach.profileFieldRestingHr', unit: 'bpm'},
  lactate_threshold: {labelKey: 'coach.profileFieldLactateThreshold', unit: 'bpm'},
  age: {labelKey: 'coach.profileFieldAge', unit: 'years'},
  birth_date: {labelKey: 'coach.profileFieldBirthDate'},
  gender: {labelKey: 'coach.profileFieldGender'},
  experience_level: {labelKey: 'coach.profileFieldExperienceLevel'},
};

const UNIT_KEYS: Record<'kg' | 'cm' | 'bpm' | 'years', string> = {
  kg: 'coach.unitKg',
  cm: 'coach.unitCm',
  bpm: 'common.bpm',
  years: 'coach.unitYears',
};

const ProfileIcon: React.FC<{color: string}> = ({color}) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Path
      d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 6c0-2.8 2.7-5 6-5s6 2.2 6 5"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const ProfileUpdatedCard: React.FC<{
  updated: Record<string, unknown>;
}> = ({updated}) => {
  const {t} = useTranslation();

  const parts = Object.entries(updated)
    .filter(([key, value]) => value != null && FIELD_SPECS[key])
    .map(([key, value]) => {
      const spec = FIELD_SPECS[key];
      const unit = spec.unit ? ` ${t(UNIT_KEYS[spec.unit])}` : '';
      return `${t(spec.labelKey)} ${value}${unit}`;
    });

  if (parts.length === 0) return null;

  return (
    <CoachCard accent={ACCENT.green} testID="profile-updated-card">
      <View style={styles.headRow}>
        <IconTile accent={ACCENT.green}>
          <ProfileIcon color={ACCENT.green.icon} />
        </IconTile>
        <Eyebrow>{t('coach.profileUpdatedLabel')}</Eyebrow>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {parts.join(' · ')}
      </Text>
    </CoachCard>
  );
};

const styles = makeStyles(theme => ({
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
    color: theme.colors.text.deepInk,
    marginTop: 12,
    lineHeight: 20,
  },
}));
