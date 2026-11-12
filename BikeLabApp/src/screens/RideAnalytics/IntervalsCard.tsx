// The ride's work blocks, in the Power analysis section (PowerInsights):
// what the session actually was. One row per block — length · where its
// watts sit against the target zone · watts. The
// headline is the set ("3 × 8:00"), the pill is the verdict (efforts inside
// the target, or last effort vs first when there is no target).
// Blocks come from @bikelab/shared calc/rideIntervals.ts via mapRideIntervals.
import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RidePowerIntervalsModel } from '@bikelab/shared/types';
import { makeStyles, useTheme, withOpacity } from '../../theme';
import {
  formatClock,
  formatSignedPct,
  intervalsAxis,
  intervalsVerdict,
} from './powerInsightsLib';

const OTHER_TONE = 'rgba(255, 255, 255, 0.35)';
const DOT = 5;
/** "3/3 in target", or "3/3 at or above target" when an effort went over. */
const verdictKey = (tone: string): string =>
  tone === 'over'
    ? 'rideAnalytics.power.intervals.overTarget'
    : 'rideAnalytics.power.intervals.inTarget';

export const IntervalsCard: React.FC<{
  intervals: RidePowerIntervalsModel;
}> = ({ intervals }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { blocks, set, target } = intervals;
  const axis = intervalsAxis(intervals);
  const verdict = intervalsVerdict(intervals);
  const toneColor =
    verdict?.tone === 'up'
      ? theme.colors.success
      : verdict?.tone === 'over'
      ? theme.colors.metric.power
      : verdict?.tone === 'down'
      ? theme.colors.danger
      : null;
  const longest = blocks.reduce((a, b) => (b.durationS > a.durationS ? b : a));

  return (
    <View style={styles.card} testID="power-intervals">
      <View style={styles.titleRow}>
        <Text style={styles.cardTitle}>
          {t(
            set
              ? 'rideAnalytics.power.intervals.title'
              : 'rideAnalytics.power.intervals.effortsTitle',
          )}
        </Text>
        {target ? (
          <Text style={styles.target} testID="power-intervals-target">
            {t('rideAnalytics.power.intervals.target', {
              low: target.low,
              high: target.high,
            })}
          </Text>
        ) : null}
      </View>

      <View style={styles.head}>
        <Text style={styles.value} testID="power-intervals-headline">
          {set
            ? `${set.reps} × ${formatClock(set.durationS)}`
            : t('rideAnalytics.power.intervals.effortsCount', {
                count: blocks.length,
              })}
        </Text>
        {verdict ? (
          <View
            style={[
              styles.pill,
              toneColor
                ? { backgroundColor: withOpacity(toneColor, 0.14) }
                : null,
            ]}
            testID="power-intervals-verdict"
          >
            <Text
              style={[styles.pillText, toneColor ? { color: toneColor } : null]}
            >
              {t(verdictKey(verdict.tone), {
                hits: verdict.hits,
                reps: verdict.reps,
              })}
            </Text>
          </View>
        ) : null}
      </View>

      {/* One row per block: its length, where its watts sit, the watts.
          With a target the track is a zoomed watts axis — the target is the
          green zone, the block a needle on it, so "inside or not" is read at a
          glance. Without one, a plain bar from zero. */}
      <View style={styles.rows}>
        {blocks.map(b => {
          const color =
            b.inSet || !set ? theme.colors.metric.power : OTHER_TONE;
          const at = Math.min(1, Math.max(0, (b.avgW - axis.lo) / axis.span));
          // The row says the verdict by itself — needle and zone share one
          // colour: green inside the target, the power colour above it
          // (extra work is rewarded, not flagged), red below it.
          const needle = !target
            ? theme.colors.success
            : b.avgW < target.low
            ? theme.colors.danger
            : b.avgW > target.high
            ? theme.colors.metric.power
            : theme.colors.success;
          return (
            <View
              key={b.index}
              style={styles.row}
              testID={`power-interval-${b.index}`}
            >
              <Text style={styles.rowDuration}>{formatClock(b.durationS)}</Text>
              <View style={styles.track}>
                <View style={styles.trackLine} />
                {target ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.zone,
                      {
                        left: `${((target.low - axis.lo) / axis.span) * 100}%`,
                        width: `${
                          ((target.high - target.low) / axis.span) * 100
                        }%`,
                        backgroundColor: withOpacity(needle, 0.35),
                      },
                    ]}
                    testID={`power-interval-zone-${b.index}`}
                  />
                ) : null}
                {target ? (
                  <View
                    style={[
                      styles.dot,
                      { left: `${at * 100}%`, backgroundColor: needle },
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.fill,
                      { width: `${at * 100}%`, backgroundColor: color },
                    ]}
                  />
                )}
              </View>
              <Text style={styles.rowWatts}>
                {b.avgW}
                <Text style={styles.rowUnit}> W</Text>
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.legend} testID="power-intervals-legend">
        {set
          ? t('rideAnalytics.power.intervals.legendSet', {
              watts: set.avgW,
              pct: formatSignedPct(set.fadePct),
              rest: formatClock(set.restS),
            })
          : t('rideAnalytics.power.intervals.legendEfforts', {
              duration: formatClock(longest.durationS),
              watts: longest.avgW,
            })}
      </Text>
    </View>
  );
};

const styles = makeStyles(theme => ({
  card: {
    marginHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[12],
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.03),
    borderRadius: theme.radii.lg,
    padding: theme.spacing[16],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[12],
  },
  cardTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  target: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    marginBottom: theme.spacing[20],
  },
  value: {
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.6,
    fontWeight: '800',
    color: theme.colors.text.inverse,
  },
  pill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing[10],
    paddingVertical: theme.spacing[4] + 1,
  },
  pillText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  rows: { gap: theme.spacing[14] },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowDuration: {
    width: 44,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.55)',
  },
  // The dot is centred on its watts, so the track keeps half a dot of room
  // on each side.
  track: {
    flex: 1,
    height: 20,
    justifyContent: 'center',
    marginHorizontal: DOT / 2 + theme.spacing[4],
  },
  trackLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  zone: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 3,
  },
  // A needle, not a dot: it marks one value on the axis and stays readable
  // on top of the zone.
  dot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: DOT,
    marginLeft: -DOT / 2,
    borderRadius: DOT / 2,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 6,
    height: 8,
    borderRadius: 4,
  },
  rowWatts: {
    width: 64,
    textAlign: 'right',
    fontSize: theme.typography.fontSize.md,
    fontWeight: '800',
    color: theme.colors.text.inverse,
  },
  rowUnit: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  legend: {
    fontSize: theme.typography.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: theme.spacing[14],
    paddingTop: theme.spacing[12],
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
}));
