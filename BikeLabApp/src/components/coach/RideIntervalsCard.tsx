import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import {
  ACCENT,
  CoachCard,
  Divider,
  Eyebrow,
  IconTile,
} from './CoachCardChrome';
import { colors, makeStyles, withOpacity } from '../../theme';
import type { RidePowerIntervalsModel } from '@bikelab/shared/types';
import {
  formatClock,
  formatSignedPct,
  intervalsAxis,
} from '../../screens/RideAnalytics/powerInsightsLib';
import { intervalsPill } from './powerCardLib';

// Shown above the ride-power card when get_ride_power_breakdown found work
// blocks in the ride: the session itself, on its own card so the verdict is
// not lost among NP / IF / TSS. The set is the headline ("3 × 8:02"), the
// pill is the verdict (efforts inside the target, else last vs first), then
// one row per block — length · where its watts sit against the target zone ·
// watts — the same reading as the ride screen's Intervals card.

const BlocksIcon: React.FC<{ color: string }> = ({ color }) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Path
      d="M3 15V9h3v6M8.5 15V5h3v10M14 15V9h3v6"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const DOT = 5;

export const RideIntervalsCard: React.FC<{
  intervals: RidePowerIntervalsModel;
}> = ({ intervals }) => {
  const { t } = useTranslation();
  const accent = ACCENT.purple;
  const { blocks, set, target } = intervals;
  const axis = intervalsAxis(intervals);
  const verdict = intervalsPill(intervals);
  const tone =
    verdict?.tone === 'good'
      ? colors.coach.accents.green.icon
      : verdict?.tone === 'over'
      ? colors.coach.accents.purple.icon
      : verdict?.tone === 'bad'
      ? colors.coach.accents.amber.icon
      : colors.coach.rowMuted;
  const longest = blocks.reduce((a, b) => (b.durationS > a.durationS ? b : a));

  return (
    <CoachCard accent={accent} style={styles.card} testID="ride-intervals-card">
      <View style={styles.headRow}>
        <IconTile accent={accent}>
          <BlocksIcon color={accent.icon} />
        </IconTile>
        <Eyebrow>
          {t(
            set
              ? 'rideAnalytics.power.intervals.title'
              : 'rideAnalytics.power.intervals.effortsTitle',
          )}
        </Eyebrow>
        <View style={styles.headSpacer} />
        {target ? (
          <Text style={styles.target} testID="ride-intervals-target">
            {t('rideAnalytics.power.intervals.target', {
              low: target.low,
              high: target.high,
            })}
          </Text>
        ) : null}
      </View>

      <View style={styles.setRow}>
        <Text style={styles.setValue} testID="ride-intervals-headline">
          {set
            ? `${set.reps} × ${formatClock(set.durationS)}`
            : t('rideAnalytics.power.intervals.effortsCount', {
                count: blocks.length,
              })}
        </Text>
        {verdict ? (
          <View
            style={[styles.pill, { backgroundColor: withOpacity(tone, 0.12) }]}
            testID="ride-intervals-verdict"
          >
            <View style={[styles.pillDot, { backgroundColor: tone }]} />
            <Text style={[styles.pillText, { color: tone }]}>
              {t(
                verdict.tone === 'over'
                  ? 'rideAnalytics.power.intervals.overTarget'
                  : 'rideAnalytics.power.intervals.inTarget',
                { hits: verdict.hits, reps: verdict.reps },
              )}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.rows}>
        {blocks.map(b => {
          const color = b.inSet || !set ? accent.icon : colors.coach.rowMuted;
          const at = Math.min(1, Math.max(0, (b.avgW - axis.lo) / axis.span));
          // The row says the verdict by itself — needle and zone share one
          // colour: green inside the target, purple above it (extra work is
          // rewarded, not flagged), red below it.
          const needle = !target
            ? colors.coach.accents.green.icon
            : b.avgW < target.low
            ? colors.coach.accents.red.icon
            : b.avgW > target.high
            ? colors.coach.accents.purple.icon
            : colors.coach.accents.green.icon;
          return (
            <View
              key={b.index}
              style={styles.row}
              testID={`ride-intervals-block-${b.index}`}
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
                        backgroundColor: withOpacity(needle, 0.3),
                      },
                    ]}
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

      <Divider />
      <Text style={styles.legend} testID="ride-intervals-legend">
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
    </CoachCard>
  );
};

const styles = makeStyles(theme => ({
  card: { minWidth: 280 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  headSpacer: { flex: 1 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // The chrome's StatusPill, a size down and centred on the headline.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillDot: { width: 5, height: 5, borderRadius: 2.5 },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  setValue: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: theme.colors.text.deepInk,
  },
  target: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.coach.rowMuted,
  },
  rows: { gap: 10, marginTop: 16, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowDuration: {
    width: 40,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.coach.rowMuted,
  },
  track: {
    flex: 1,
    height: 18,
    justifyContent: 'center',
    marginHorizontal: DOT / 2 + 4,
  },
  trackLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.coach.divider,
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
    top: 5,
    height: 8,
    borderRadius: 4,
  },
  rowWatts: {
    width: 58,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text.deepInk,
  },
  rowUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.coach.rowMuted,
  },
  legend: {
    fontSize: 12,
    color: theme.colors.coach.rowMuted,
  },
}));
