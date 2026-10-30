import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Path} from 'react-native-svg';
import {ACCENT, CoachCard, Eyebrow, IconTile} from './CoachCardChrome';
import {makeStyles} from '../../theme';
import {describeProfileUpdate, type ProfileFieldUnit} from '@bikelab/shared/coach';

// Shown inline in the chat when the coach's update_rider_profile tool call
// succeeds — `updated` is the tool's result object itself (`{weight?,
// height?, birth_date?, …}`, see aiCoach.js's executor), only the keys the
// coach actually changed are present; which keys are recognised, and their
// units, is shared (describeProfileUpdate). Same card family as
// ChecklistUpdatedCard/GoalCreatedCard, no footer link (no single screen to
// jump to — the fields live across several Profile screens).
const UNIT_KEYS: Record<ProfileFieldUnit, string> = {
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

  const parts = describeProfileUpdate(updated).map(({labelKey, value, unit}) => {
    const unitText = unit ? ` ${t(UNIT_KEYS[unit])}` : '';
    return `${t(labelKey)} ${value}${unitText}`;
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
