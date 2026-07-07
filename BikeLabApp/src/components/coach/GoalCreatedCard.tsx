import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';

const TIER_COLORS: Record<string, string> = {
  legendary: '#FC5200',
  epic: '#8B5CF6',
  grand: '#274dd3',
  base: '#ccc',
};

export interface CreatedGoalSummary {
  id: number;
  title: string;
  description?: string;
  tier?: string;
  target_date?: string;
}

// Shown inline in the chat when the coach's create_goal tool call succeeds.
// Tapping "View Details" navigates to the existing GoalDetailsScreen — no
// changes needed there, it already renders whatever's in meta_goals/goals.
export const GoalCreatedCard: React.FC<{
  goal: CreatedGoalSummary;
  onPress: () => void;
}> = ({goal, onPress}) => {
  const {t} = useTranslation();
  const tierColor = TIER_COLORS[goal.tier || 'base'] || TIER_COLORS.base;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.accent, {backgroundColor: tierColor}]} />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{t('coach.goalCreatedLabel')}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {goal.title}
        </Text>
        {!!goal.description && (
          <Text style={styles.description} numberOfLines={2}>
            {goal.description}
          </Text>
        )}
        <View style={styles.footer}>
          <Text style={styles.viewDetails}>{t('coach.viewDetails')} →</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#ECECEC',
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 4,
    maxWidth: '90%',
  },
  accent: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: '#888',
    lineHeight: 16,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  viewDetails: {
    fontSize: 12,
    fontWeight: '700',
    color: '#274dd3',
  },
});
