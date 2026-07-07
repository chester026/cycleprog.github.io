import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {ToolCallStatus} from '../../types/coach';

// Friendly labels for the tool names defined in server/aiCoach.js — falls
// back to a generic "Checking your data..." for anything unmapped so a new
// backend tool never renders as a raw function name.
const TOOL_LABEL_KEYS: Record<string, string> = {
  get_user_profile: 'coach.toolProfile',
  get_recent_activities: 'coach.toolActivities',
  get_activity_totals: 'coach.toolTotals',
  get_activity_analysis: 'coach.toolActivityAnalysis',
  get_analytics_snapshot: 'coach.toolAnalytics',
  get_skills_radar: 'coach.toolSkills',
  get_goals_progress: 'coach.toolGoalsProgress',
  create_goal: 'coach.toolCreateGoal',
  update_goal: 'coach.toolUpdateGoal',
  get_training_recommendations: 'coach.toolTraining',
  get_bike_health: 'coach.toolBikeHealth',
  get_achievements: 'coach.toolAchievements',
  get_calendar: 'coach.toolCalendar',
  create_calendar_event: 'coach.toolCreateCalendarEvent',
  update_calendar_event: 'coach.toolUpdateCalendarEvent',
  delete_calendar_event: 'coach.toolDeleteCalendarEvent',
};

// Takes plain name/status rather than a single ToolCall object — a "plan my
// week" turn can fire the same tool (e.g. create_calendar_event) a dozen
// times in a row, and rendering one full-width pill per call used to flood
// the chat with a wall of identical-looking rows (see ChatMessageBubble's
// groupToolCalls). Consecutive same-name calls collapse into one pill.
// `count` is intentionally not displayed — the exact number of calendar
// writes isn't something the user needs to see, just that the step ran and
// finished; a "×5" reads as something to double-check rather than a detail
// to ignore.
export const ToolCallCard: React.FC<{name: string; status: ToolCallStatus; count?: number}> = ({name, status}) => {
  const {t} = useTranslation();
  const labelKey = TOOL_LABEL_KEYS[name] || 'coach.toolGeneric';
  const done = status === 'done';

  return (
    <View style={styles.card}>
      {done ? (
        <View style={styles.checkDot} />
      ) : (
        <ActivityIndicator size="small" color="#274dd3" style={styles.spinner} />
      )}
      <Text style={styles.label}>{t(labelKey)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(39, 77, 211, 0.06)',
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  spinner: {
    marginRight: 8,
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 8,
  },
  label: {
    fontSize: 12,
    color: '#274dd3',
    fontWeight: '600',
  },
});
