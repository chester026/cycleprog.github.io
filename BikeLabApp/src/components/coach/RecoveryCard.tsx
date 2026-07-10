import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {HealthContext} from '../../utils/healthService';
import {CoachCard, Divider, StatusPill} from './CoachCardChrome';
import {ProgressRing} from './ProgressRing';

// Composite Apple Health card for the coach chat — shown when
// analyze_readiness fires (see ChatMessageBubble.tsx). Redesigned to match
// the "Rich Chat Cards v2" reference exactly: a gradient progress ring +
// status pill on top, then a divider, then Sleep/Resting HR/HRV as
// full-width label/value rows below — this supersedes an earlier iteration
// that put the score and rows side-by-side; the reference mockup the user
// handed over settles on the stacked layout instead.
//
// Renders from the client's OWN local health snapshot (the `context` prop,
// built by useHealthData()/buildHealthContext), never from a tool_call
// result — see aiCoach.js's analyze_readiness executor for why real health
// numbers deliberately never ride in a tool result (they'd get persisted
// into coach_messages.tool_calls otherwise).
//
// Bucket boundaries mirror APPLE_HEALTH_SPEC.md §5's score-interpretation
// table (85-100 Peak ... 0-29 Very Low) — the note-worthy thing is this is
// the OPPOSITE direction from RideScoreCard's effort buckets: high effort
// is intense (orange/red), high recovery is GOOD (green).
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const BUCKETS: {min: number; key: string; ring: [string, string]}[] = [
  {min: 85, key: 'coach.recoveryPeak', ring: ['#2FD37E', '#14A863']},
  {min: 70, key: 'coach.recoveryGood', ring: ['#A4D96B', '#7CB342']},
  {min: 55, key: 'coach.recoveryModerate', ring: ['#FFC24B', '#F5A11E']},
  {min: 30, key: 'coach.recoveryLow', ring: ['#FF8A50', '#F26B1D']},
  {min: 0, key: 'coach.recoveryVeryLow', ring: ['#EF6B6B', '#D84343']},
];

export const RecoveryCard: React.FC<{context: HealthContext}> = ({context}) => {
  const {t} = useTranslation();
  const score = context.recovery_score;
  const bucket = score != null ? BUCKETS.find(b => score >= b.min) || BUCKETS[BUCKETS.length - 1] : null;
  const color = bucket ? bucket.ring[1] : '#B0B0B7';

  const rows: {label: string; value: string}[] = [];
  if (context.sleep_hours != null) {
    rows.push({
      label: t('coach.recoverySleep'),
      value: `${context.sleep_hours.toFixed(1)}${t('common.h')}${
        context.sleep_deep_pct != null ? ` · ${Math.round(context.sleep_deep_pct)}% ${t('coach.recoveryDeep')}` : ''
      }`,
    });
  }
  if (context.resting_hr_bpm != null) {
    rows.push({
      label: t('coach.recoveryRestingHR'),
      value: `${context.resting_hr_bpm} ${t('common.bpm')}${
        context.resting_hr_baseline_bpm != null
          ? ` (${t('coach.recoveryBaseline')} ${Math.round(context.resting_hr_baseline_bpm)})`
          : ''
      }`,
    });
  }
  if (context.hrv_ms != null) {
    rows.push({
      label: t('coach.recoveryHRV'),
      value: `${Math.round(context.hrv_ms)} ${t('common.ms')}${
        context.hrv_baseline_ms != null ? ` (${t('coach.recoveryBaseline')} ${Math.round(context.hrv_baseline_ms)})` : ''
      }`,
    });
  }

  return (
    <CoachCard glow={false} style={styles.card}>
      <View style={styles.headRow}>
        <ProgressRing value={score ?? 0} colors={bucket ? bucket.ring : ['#D8D8DE', '#B0B0B7']} gradientId="recoveryRing">
          {score != null ? (
            <>
              <Text style={styles.scoreNumber}>{score}</Text>
              <Text style={styles.scoreOf}>/100</Text>
            </>
          ) : (
            <Text style={styles.noScoreDash}>—</Text>
          )}
        </ProgressRing>
        <View style={styles.info}>
          <Text style={styles.eyebrow}>{t('coach.recoveryScoreLabel')}</Text>
          <View style={styles.pillWrap}>
            {bucket ? (
              <StatusPill color={color} tint={hexToRgba(color, 0.12)} label={t(bucket.key)} />
            ) : (
              <Text style={styles.noScore}>{t('coach.recoveryNoScore')}</Text>
            )}
          </View>
        </View>
      </View>

      {rows.length > 0 && (
        <>
          <Divider />
          <View style={styles.rows}>
            {rows.map((row, i) => (
              <View key={i} style={styles.statRow}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </CoachCard>
  );
};

const styles = StyleSheet.create({
  card: {
    minWidth: 260,
  },
  headRow: {
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
  noScoreDash: {
    fontSize: 22,
    fontWeight: '700',
    color: '#C7C7CC',
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
  noScore: {
    fontSize: 13,
    color: '#999',
  },
  rows: {
    gap: 10,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  rowLabel: {
    fontSize: 14,
    color: '#9A9AA2',
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0E0E12',
  },
});
