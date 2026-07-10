import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {CoachCard, StatusPill} from './CoachCardChrome';
import {ProgressRing} from './ProgressRing';

// Score card for the coach chat — shown when get_activity_analysis returns
// an effort_score. Redesigned around the "Rich Chat Cards v2" style
// reference: a gradient progress ring instead of a plain number, sitting
// next to the eyebrow/status pill, on the shared CoachCard chrome.
// Score buckets/colors/i18n keys unchanged from the previous version —
// this only touches presentation, not the scoring logic itself.
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const BUCKETS: {max: number; key: string; ring: [string, string]}[] = [
  {max: 20, key: 'rideAnalytics.scoreRecovery', ring: ['#7CC2FF', '#4DA3FF']},
  {max: 40, key: 'rideAnalytics.scoreEasy', ring: ['#2FD37E', '#14A863']},
  {max: 55, key: 'rideAnalytics.scoreModerate', ring: ['#FFC24B', '#F5A11E']},
  {max: 70, key: 'rideAnalytics.scoreTempo', ring: ['#A4D96B', '#7CB342']},
  {max: 82, key: 'rideAnalytics.scoreHard', ring: ['#FF8A50', '#F26B1D']},
  {max: 90, key: 'rideAnalytics.scoreHeavy', ring: ['#9B7EEA', '#6A4CCF']},
  {max: 101, key: 'rideAnalytics.scoreExhausted', ring: ['#EF6B6B', '#D84343']},
];

export const RideScoreCard: React.FC<{score: number}> = ({score}) => {
  const {t} = useTranslation();
  const bucket = BUCKETS.find(b => score <= b.max) || BUCKETS[BUCKETS.length - 1];
  const color = bucket.ring[1];

  return (
    <CoachCard glow={false} style={styles.card}>
      <View style={styles.row}>
        <ProgressRing value={score} colors={bucket.ring} gradientId="effortRing">
          <Text style={styles.scoreNumber}>{score}</Text>
          <Text style={styles.scoreOf}>/100</Text>
        </ProgressRing>
        <View style={styles.info}>
          <Text style={styles.eyebrow}>{t('rideAnalytics.effortScore')}</Text>
          <View style={styles.pillWrap}>
            <StatusPill color={color} tint={hexToRgba(color, 0.12)} label={t(bucket.key)} />
          </View>
        </View>
      </View>
    </CoachCard>
  );
};

const styles = StyleSheet.create({
  // `info`'s flex:1 needs a resolved container width to actually grow into —
  // CoachCard's outer wrapper shrink-wraps to content by default (so a short
  // goal title doesn't force a full-width card), which otherwise collapses
  // a flex:1 child to near-zero (no "available space" to distribute). This
  // minWidth on the inner card is what RecoveryCard also relies on for the
  // same reason — it propagates up and gives the row something to expand in.
  card: {
    minWidth: 240,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  scoreNumber: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: '#0E0E12',
    lineHeight: 30,
  },
  scoreOf: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B0B0B7',
  },
  info: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#8A8A93',
  },
  pillWrap: {
    marginTop: 8,
  },
});
