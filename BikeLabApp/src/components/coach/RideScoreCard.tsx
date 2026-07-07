import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';

// Compact score card for the coach chat — shown when get_activity_analysis
// returns an effort_score. Deliberately simpler than the old dashboard
// gauge (no SVG circle): a colored dot + number + bucket label, matching
// the visual language already established by GoalCreatedCard/ToolCallCard
// in this chat rather than porting a chart component into a narrow bubble.
// Score buckets and colors mirror what RideAnalyticsScreen used to render
// client-side, reusing the same i18n keys so the wording stays consistent
// with anything else in the app that still talks about "effort".
const BUCKETS: {max: number; key: string; color: string}[] = [
  {max: 20, key: 'rideAnalytics.scoreRecovery', color: '#4DA3FF'},
  {max: 40, key: 'rideAnalytics.scoreEasy', color: '#2BB673'},
  {max: 55, key: 'rideAnalytics.scoreModerate', color: '#F9A825'},
  {max: 70, key: 'rideAnalytics.scoreTempo', color: '#7CB342'},
  {max: 82, key: 'rideAnalytics.scoreHard', color: '#F26B1D'},
  {max: 90, key: 'rideAnalytics.scoreHeavy', color: '#6A4CCF'},
  {max: 101, key: 'rideAnalytics.scoreExhausted', color: '#D84343'},
];

export const RideScoreCard: React.FC<{score: number}> = ({score}) => {
  const {t} = useTranslation();
  const bucket = BUCKETS.find(b => score <= b.max) || BUCKETS[BUCKETS.length - 1];

  return (
    <View style={styles.card}>
      <View style={[styles.dot, {backgroundColor: bucket.color}]} />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{t('rideAnalytics.effortScore')}</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreNumber}>{score}</Text>
          <Text style={styles.scoreOf}>/100</Text>
        </View>
        <Text style={[styles.label, {color: bucket.color}]}>{t(bucket.key)}</Text>
      </View>
    </View>
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
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  dot: {
    width: 4,
  },
  content: {
    padding: 12,
    minWidth: 140,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  scoreNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a1a',
  },
  scoreOf: {
    fontSize: 13,
    fontWeight: '600',
    color: '#bbb',
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 2,
  },
});
