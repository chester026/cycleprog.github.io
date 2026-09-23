import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Path} from 'react-native-svg';
import {ACCENT, CoachCard, Eyebrow, FooterLink, IconTile} from './CoachCardChrome';
import {makeStyles} from '../../theme';

// Shown inline in the chat when the coach's remember_about_rider or
// forget_about_rider tool call succeeds (server tools, coach-memory wave) —
// same visual family as ChecklistUpdatedCard/GoalCreatedCard. Tapping it
// takes the rider to the dedicated CoachMemoryScreen (Profile > Coach
// Settings > Memory), the same place these notes are read/edited by hand.
export type CoachMemoryUpdate =
  | {type: 'remembered'; note: string}
  | {type: 'forgotten'; note: string};

const NoteIcon: React.FC<{color: string}> = ({color}) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Path
      d="M5 3.5h10a1 1 0 0 1 1 1v11l-3-2-2 2-2-2-2 2-2-2-1 1v-11a1 1 0 0 1 1-1Z"
      stroke={color}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </Svg>
);

export const CoachMemoryCard: React.FC<{
  update: CoachMemoryUpdate;
  onPress: () => void;
}> = ({update, onPress}) => {
  const {t} = useTranslation();
  const accent = update.type === 'forgotten' ? ACCENT.gray : ACCENT.blue;
  const titleKey = update.type === 'remembered' ? 'coach.memoryRemembered' : 'coach.memoryForgot';

  return (
    <CoachCard accent={accent} onPress={onPress} testID="coach-memory-card">
      <View style={styles.headRow}>
        <IconTile accent={accent}>
          <NoteIcon color={accent.icon} />
        </IconTile>
        <Eyebrow>{t('coach.memoryUpdatedLabel')}</Eyebrow>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {t(titleKey, {note: update.note})}
      </Text>
      <FooterLink label={t('coach.viewMemory')} />
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
