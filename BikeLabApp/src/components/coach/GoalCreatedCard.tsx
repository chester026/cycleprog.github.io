import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Circle} from 'react-native-svg';
import {ACCENT, CoachCard, Eyebrow, FooterLink, IconTile} from './CoachCardChrome';

const TIER_ACCENT: Record<string, typeof ACCENT.blue> = {
  legendary: ACCENT.orange,
  epic: ACCENT.purple,
  grand: ACCENT.blue,
  base: ACCENT.gray,
};

export interface CreatedGoalSummary {
  id: number;
  title: string;
  description?: string;
  tier?: string;
  target_date?: string;
}

const TargetIcon: React.FC<{color: string}> = ({color}) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Circle cx={10} cy={10} r={7.3} stroke={color} strokeWidth={1.7} />
    <Circle cx={10} cy={10} r={3.2} stroke={color} strokeWidth={1.7} />
    <Circle cx={10} cy={10} r={0.9} fill={color} />
  </Svg>
);

// Shown inline in the chat when the coach's create_goal tool call succeeds.
// Tapping "View Details" navigates to the existing GoalDetailsScreen — no
// changes needed there, it already renders whatever's in meta_goals/goals.
// Visual language ported from the "Rich Chat Cards v2" reference: icon tile
// + eyebrow + title + footer link, on the shared CoachCard chrome. Tier
// still drives the accent color (legendary/epic/grand/base), same as the
// old side-strip did, just expressed through the icon tile/glow now.
export const GoalCreatedCard: React.FC<{
  goal: CreatedGoalSummary;
  onPress: () => void;
}> = ({goal, onPress}) => {
  const {t} = useTranslation();
  const accent = TIER_ACCENT[goal.tier || 'base'] || TIER_ACCENT.base;

  return (
    <CoachCard accent={accent} onPress={onPress}>
      <View style={styles.headRow}>
        <IconTile accent={accent}>
          <TargetIcon color={accent.icon} />
        </IconTile>
        <Eyebrow>{t('coach.goalCreatedLabel')}</Eyebrow>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {goal.title}
      </Text>
      {!!goal.description && (
        <Text style={styles.description} numberOfLines={2}>
          {goal.description}
        </Text>
      )}
      <FooterLink label={t('coach.viewDetails')} />
    </CoachCard>
  );
};

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: '#0E0E12',
    marginTop: 12,
  },
  description: {
    fontSize: 13,
    color: '#61616B',
    lineHeight: 18,
    marginTop: 6,
  },
});
