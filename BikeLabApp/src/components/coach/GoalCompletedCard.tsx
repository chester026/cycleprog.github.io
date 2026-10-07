import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Path} from 'react-native-svg';
import {ACCENT, CoachCard, Eyebrow, FooterLink, IconTile} from './CoachCardChrome';
import {makeStyles} from '../../theme';

export interface CompletedGoalSummary {
  goalId: number;
  title: string;
  ridesCount: number;
}

const CheckIcon: React.FC<{color: string}> = ({color}) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Path d="M4.5 10.5l3.7 3.7L15.5 6.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// Shown inline in the chat when the coach's complete_goal tool call succeeds.
// Same CoachCard family as GoalCreatedCard; tapping opens the goal.
export const GoalCompletedCard: React.FC<{
  goal: CompletedGoalSummary;
  onPress: () => void;
}> = ({goal, onPress}) => {
  const {t} = useTranslation();
  return (
    <CoachCard accent={ACCENT.green} onPress={onPress} testID="goal-completed-card">
      <View style={styles.headRow}>
        <IconTile accent={ACCENT.green}>
          <CheckIcon color={ACCENT.green.icon} />
        </IconTile>
        <Eyebrow>{t('coach.goalCompletedLabel')}</Eyebrow>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {goal.title}
      </Text>
      {goal.ridesCount > 0 && (
        <Text style={styles.rides}>{t('coach.goalCompletedRides', {count: goal.ridesCount})}</Text>
      )}
      <FooterLink label={t('coach.viewDetails')} />
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
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: theme.colors.text.deepInk,
    marginTop: 12,
  },
  rides: {
    fontSize: 13,
    color: theme.colors.coach.trendChart.legendText,
    marginTop: 6,
  },
}));
