// The ride screen's Power block (docs/plans/ride-power-insights.md) — drawn
// between the stream charts and the time-in-zones bars for rides with a
// power meter. Four pieces, each one a reason to ride again:
//   headline  — what this ride was: a best / a top-3 effort / its intensity
//   efforts   — 5 s … 1 h with how close each sits to the 12-week best
//   trend     — weekly bests for 5 and 20 min, where there is enough history
//   climbs    — the real climbs with watts, HR and speed; the strongest marked
// Same visual language as the rest of the dark ride surface (RideStats,
// PowerProfileBars): opacity-on-white text, the metric's own colour (purple
// = power, theme.colors.metric) for the one thing that matters on each row.
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type {
  RidePowerBreakdownResponse,
  RidePowerInsightsDto,
  RideSegmentDto,
} from '@bikelab/shared/api';
import { mapRideIntervals } from '@bikelab/shared/coach';
import { makeStyles, useTheme, withOpacity } from '../../theme';
import { IntervalsCard } from './IntervalsCard';
import { StreamingDots } from '../../components/coach/StreamingDots';
import {
  bestClimb,
  climbRows,
  durationKey,
  formatClock,
  formatKm,
  formatSignedPct,
  formatSignedWatts,
  headline,
  profilePaths,
  isEasyRide,
  showsComparison,
} from './powerInsightsLib';

interface PowerInsightsProps {
  data: RidePowerBreakdownResponse;
}

const BAR_TRACK = 'rgba(255, 255, 255, 0.08)';
const TREND_BAR_TONE = 'rgba(255, 255, 255, 0.22)';

export const PowerInsights: React.FC<PowerInsightsProps> = ({ data }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { breakdown, insights } = data;
  if (breakdown.source !== 'meter' || !insights) return null;

  const head = headline(insights);
  const hasFtp = breakdown.if_ !== null && breakdown.tss !== null;
  const climbs = climbRows(breakdown.segments);
  const strongest = bestClimb(climbs);
  const intervals = mapRideIntervals(breakdown.intervals);

  return (
    <View style={styles.section} testID="power-insights">
      <Text style={styles.sectionTitle}>{t('rideAnalytics.power.title')}</Text>
      {/* Static context for everything below — the FTP the numbers are
          measured against, W/kg, and whether this ride moved it. */}
      {insights.ftp ? (
        <View style={styles.meta} testID="power-ftp">
          <Text style={styles.metaLabel}>{t('rideAnalytics.power.ftp')}</Text>
          <View style={styles.wkgPill}>
            <Text style={styles.wkgText}>
              {insights.ftp.watts} W
              {insights.ftp.w_per_kg !== null
                ? ` · ${t('rideAnalytics.power.wkg', {
                    value: insights.ftp.w_per_kg.toFixed(1),
                  })}`
                : ''}
            </Text>
          </View>
          {insights.ftp.delta_w === null || insights.ftp.delta_w !== 0 ? (
            <Text
              style={[
                styles.metaDelta,
                (insights.ftp.delta_w === null || insights.ftp.delta_w > 0) &&
                  styles.metaUp,
              ]}
              testID="power-ftp-delta"
            >
              {insights.ftp.delta_w === null
                ? t('rideAnalytics.power.ftpFirst')
                : t('rideAnalytics.power.ftpDelta', {
                    delta: formatSignedWatts(insights.ftp.delta_w),
                  })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* TSS · NP · IF · VI · coasting — a horizontal strip: the tiles never
          fit a phone width without the labels wrapping. Average is already
          on the stream charts above; the intensity band is in the
          effort score up top, so the headline sentence stands alone. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statStrip}
        contentContainerStyle={styles.statStripContent}
      >
        {hasFtp ? <Stat label="TSS" value={`${breakdown.tss}`} /> : null}
        <Stat
          label={t('rideAnalytics.power.np')}
          value={`${breakdown.np_w ?? '–'}`}
          unit="W"
        />
        {hasFtp ? (
          <Stat label="IF" value={(breakdown.if_ as number).toFixed(2)} />
        ) : null}
        {breakdown.vi !== null ? (
          <Stat label="VI" value={breakdown.vi.toFixed(2)} />
        ) : null}
        {breakdown.coasting_pct !== null ? (
          <Stat
            label={t('rideAnalytics.power.coasting')}
            value={`${breakdown.coasting_pct}`}
            unit="%"
          />
        ) : null}
      </ScrollView>

      {/* Headline — a best / top-3 effort, under the tiles */}
      {head ? (
        <View style={styles.headline} testID="power-headline-banner">
          <View style={styles.headlineIcon}>
            <CrownIcon size={16} color={theme.colors.text.inverse} />
          </View>
          <Text style={styles.headlineText} testID="power-headline">
            {t(`rideAnalytics.power.headline.${head.kind}`, {
              duration: t(`rideAnalytics.power.duration.${head.subject}`),
              rank: head.rank,
              total: head.total,
              weeks: insights.weeks,
            })}
          </Text>
        </View>
      ) : null}

      {/* The session itself: its work blocks against the target */}
      {intervals ? <IntervalsCard intervals={intervals} /> : null}

      {/* Recent rides — this ride among the last few, over its key duration */}
      {insights.recent && insights.recent.options?.length ? (
        <RecentRidesCard
          recent={insights.recent}
          easy={isEasyRide(breakdown.if_)}
        />
      ) : null}

      {/* Best efforts vs the window */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {t('rideAnalytics.power.bestEfforts', { weeks: insights.weeks })}
        </Text>
        {insights.efforts.map(row => {
          const compare = showsComparison(insights, row);
          const fill =
            row.pct_of_best !== null
              ? Math.max(4, Math.min(100, row.pct_of_best))
              : 0;
          const emphasized = row.is_pr && compare;
          return (
            <View
              key={row.seconds}
              style={styles.effortRow}
              testID={`power-effort-${durationKey(row.seconds)}`}
            >
              <Text style={styles.effortLabel}>
                {t(`rideAnalytics.power.duration.${durationKey(row.seconds)}`)}
              </Text>
              <View style={styles.track}>
                {row.watts !== null ? (
                  <View
                    style={[
                      styles.fill,
                      emphasized ? styles.fillPr : styles.fillQuiet,
                      {
                        width: `${fill}%`,
                        backgroundColor: theme.colors.metric.power,
                      },
                    ]}
                  />
                ) : null}
              </View>
              <Text
                style={[
                  styles.effortWatts,
                  row.watts === null && styles.effortWattsMuted,
                ]}
                numberOfLines={1}
              >
                {row.watts === null ? '–' : `${row.watts} W`}
              </Text>
              <View style={styles.effortMeta}>
                {row.watts === null ? (
                  <Text style={styles.metaMuted} numberOfLines={1}>
                    {t('rideAnalytics.power.tooShort')}
                  </Text>
                ) : compare ? (
                  <Badge row={row} weeks={insights.weeks} />
                ) : row.best_watts !== null ? (
                  <Text style={styles.metaMuted} numberOfLines={1}>
                    {t('rideAnalytics.power.bestRef', {
                      watts: row.best_watts,
                    })}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
        {insights.partial ? (
          <Text style={styles.footnote}>
            {t('rideAnalytics.power.partial')}
          </Text>
        ) : null}
      </View>

      {/* Climbs */}
      {climbs.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {t('rideAnalytics.power.climbs')}
          </Text>
          {climbs.map(seg => (
            <ClimbRow
              key={seg.start_s}
              seg={seg}
              strongest={seg === strongest}
            />
          ))}
        </View>
      )}
    </View>
  );
};

/**
 * The section while the breakdown is being computed (the first open of a
 * ride reads its per-second stream — a few seconds): the title is already
 * in place, a line says what is happening, and the tiles and the first card
 * are drawn as pulsing placeholders, so the block does not pop in from
 * nowhere. `failed` swaps the line for the reason nothing came.
 */
export const PowerInsightsLoading: React.FC<{ failed?: boolean }> = ({
  failed = false,
}) => {
  const { t } = useTranslation();
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    if (failed) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [failed, pulse]);

  return (
    <View style={styles.section} testID="power-insights-loading">
      <Text style={styles.sectionTitle}>{t('rideAnalytics.power.title')}</Text>
      <View style={styles.loadingRow}>
        {failed ? null : <StreamingDots />}
        <Text style={styles.loadingText}>
          {t(
            failed
              ? 'rideAnalytics.power.loadFailed'
              : 'rideAnalytics.power.loading',
          )}
        </Text>
      </View>
      {failed ? null : (
        <Animated.View style={{ opacity: pulse }}>
          <View style={styles.skeletonStrip}>
            <View style={styles.skeletonTile} />
            <View style={styles.skeletonTile} />
            <View style={styles.skeletonTile} />
          </View>
          <View style={styles.skeletonCard}>
            <View style={styles.skeletonLineShort} />
            <View style={styles.skeletonValue} />
            <View style={styles.skeletonLine} />
            <View style={styles.skeletonLine} />
            <View style={styles.skeletonLine} />
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const Stat: React.FC<{
  label: string;
  value: string;
  unit?: string;
}> = ({ label, value, unit }) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>
      {value}
      {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
    </Text>
  </View>
);

// PR → purple pill; top-3 → "#2 of 14"; otherwise the watts still to go.
const Badge: React.FC<{
  row: RidePowerInsightsDto['efforts'][number];
  weeks: number;
}> = ({ row }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  if (row.is_pr) {
    return (
      <View style={styles.prPill} testID="power-badge-pr">
        <CrownIcon size={10} color={theme.colors.text.inverse} />
        <Text style={styles.prPillText}>{t('rideAnalytics.power.pr')}</Text>
      </View>
    );
  }
  if (row.rank !== null && row.rank <= 3) {
    return (
      <Text style={styles.badgeRank}>
        {t('rideAnalytics.power.rank', { rank: row.rank, total: row.total })}
      </Text>
    );
  }
  return (
    <Text style={styles.badgeGap}>
      {t('rideAnalytics.power.gap', { watts: row.gap_w })}
    </Text>
  );
};

// This ride among the rider's recent rides over one duration at a time —
// 20 min / 1 h on a segmented toggle (same control as the coach's
// Coach/Goals tabs, dark variant), opening on the duration the calc picked
// for this ride (its top-3 strength, else its intensity band's). Bars: the
// previous rides' bests over that duration, oldest first, this ride last in
// purple. The verdict is a pill with an explicit reference: red when the
// ride sits below the last-8 average, green when above or a top-3. An easy
// ride (IF under 0.7) below the average stays grey: riding
// easy is the rider's choice, not a shortfall to flag.
const RecentRidesCard: React.FC<{
  recent: NonNullable<RidePowerInsightsDto['recent']>;
  /** An easy ride: sitting under the average is the point, so no red. */
  easy?: boolean;
}> = ({ recent, easy = false }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [seconds, setSeconds] = useState(recent.default_seconds);
  const option =
    recent.options.find(o => o.seconds === seconds) ?? recent.options[0];
  const values = [...option.rides.map(r => r.watts), option.ride_w];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const barHeight = (w: number) => 12 + Math.round(((w - min) / span) * 84);
  const topThree = option.rank <= 3 && option.total >= 3;
  // Only the number is coloured (a short pill next to the ride's value);
  // the reference it is measured against is the card's subtitle, in plain
  // muted text — a whole red sentence read as an alarm.
  const verdict: {
    badge: string | null;
    caption: string;
    tone: 'up' | 'down' | 'neutral';
  } = topThree
    ? {
        badge: `#${option.rank}`,
        caption: t('rideAnalytics.power.recentRankOf', { total: option.total }),
        tone: 'up',
      }
    : option.vs_avg_pct !== null
    ? {
        badge: formatSignedPct(option.vs_avg_pct),
        caption: t('rideAnalytics.power.recentVsAvg', {
          count: option.rides.length,
          avg: option.avg_prev_w,
        }),
        tone: option.vs_avg_pct >= 0 ? 'up' : easy ? 'neutral' : 'down',
      }
    : {
        badge: null,
        caption: t('rideAnalytics.power.recentFew', { count: option.total }),
        tone: 'neutral',
      };
  const toneColor =
    verdict.tone === 'up'
      ? theme.colors.success
      : verdict.tone === 'down'
      ? theme.colors.danger
      : null;
  return (
    <View style={styles.card} testID="power-recent">
      <View style={styles.recentTitleRow}>
        <View style={styles.recentTitleText}>
          <Text style={[styles.cardTitle, styles.recentTitle]}>
            {t('rideAnalytics.power.recentTitle')}
          </Text>
        </View>
        {recent.options.length > 1 ? (
          <Text style={styles.toggleLabel}>
            {t('rideAnalytics.power.recentToggleLabel')}
          </Text>
        ) : null}
        {recent.options.length > 1 ? (
          <View style={styles.segmented} testID="power-recent-toggle">
            {recent.options.map(o => {
              const active = o.seconds === option.seconds;
              return (
                <TouchableOpacity
                  key={o.seconds}
                  onPress={() => setSeconds(o.seconds)}
                  style={[styles.segment, active && styles.segmentActive]}
                  testID={`power-recent-toggle-${durationKey(o.seconds)}`}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      active && styles.segmentTextActive,
                    ]}
                  >
                    {t(
                      `rideAnalytics.power.duration.${durationKey(o.seconds)}`,
                    )}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
      <View style={styles.recentHead}>
        <Text style={styles.recentValue}>{option.ride_w} W</Text>
        <View style={styles.verdict} testID="power-recent-verdict">
          {verdict.badge ? (
            <View
              style={[
                styles.verdictPill,
                toneColor
                  ? { backgroundColor: withOpacity(toneColor, 0.14) }
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.verdictText,
                  toneColor ? { color: toneColor } : null,
                ]}
              >
                {verdict.badge}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {/* Each bar carries its watts underneath, so the row reads as numbers
          and not just shapes; this ride's value in the power colour. */}
      <View style={styles.recentBars}>
        {option.rides.map(r => (
          <View key={r.activity_id} style={styles.recentCol}>
            <View
              style={[
                styles.recentBar,
                { height: barHeight(r.watts), backgroundColor: TREND_BAR_TONE },
              ]}
            />
            <Text style={styles.recentBarLabel} numberOfLines={1}>
              {r.watts}
            </Text>
          </View>
        ))}
        <View style={[styles.recentCol, styles.recentColRide]}>
          <View
            style={[
              styles.recentBar,
              {
                height: barHeight(option.ride_w),
                backgroundColor: theme.colors.metric.power,
              },
            ]}
            testID="power-recent-ride"
          />
          <Text
            style={[
              styles.recentBarLabel,
              styles.recentBarLabelRide,
              { color: theme.colors.metric.power },
            ]}
            numberOfLines={1}
          >
            {option.ride_w}
          </Text>
        </View>
      </View>
      {/* Legend for the bars: what the grey ones are and the average the
          badge is measured against. */}
      <Text style={styles.recentWhy} testID="power-recent-caption">
        {verdict.caption}
      </Text>
    </View>
  );
};

const ClimbRow: React.FC<{ seg: RideSegmentDto; strongest: boolean }> = ({
  seg,
  strongest,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.climbRow} testID={`power-climb-${seg.start_s}`}>
      <View style={styles.climbBody}>
        <Text style={styles.climbTitle}>
          {formatKm(seg.distance_m)} · {seg.grade_pct.toFixed(1)}%
          <Text style={styles.climbAt}>
            {'  '}
            {t('rideAnalytics.power.climbAt', {
              time: formatClock(seg.start_s),
            })}
          </Text>
        </Text>
        <View style={styles.climbStats}>
          <Text style={[styles.climbStat, strongest && styles.climbStatAccent]}>
            {seg.avg_w !== null ? `${seg.avg_w} W` : '–'}
          </Text>
          {seg.avg_hr !== null && (
            <Text style={styles.climbStat}>{seg.avg_hr} bpm</Text>
          )}
          <Text style={styles.climbStat}>
            {seg.avg_speed_kmh.toFixed(1)} km/h
          </Text>
          <Text style={styles.climbStat}>{formatClock(seg.duration_s)}</Text>
        </View>
      </View>
      {seg.profile && seg.profile.length > 1 ? (
        <ClimbProfile
          profile={seg.profile}
          id={`climb-${seg.start_s}`}
          color={theme.colors.metric.elevation}
        />
      ) : null}
    </View>
  );
};

// Fits inside the row's two text lines (title + stats), not taller.
const PROFILE_W = 80;
const PROFILE_H = 30;

// The climb's shape: a smoothed altitude line in the elevation colour with
// a gradient fill under it, like the elevation stream chart above.
const ClimbProfile: React.FC<{
  profile: number[];
  id: string;
  color: string;
}> = ({ profile, id, color }) => {
  const { line, area } = profilePaths(profile, PROFILE_W, PROFILE_H);
  return (
    <Svg
      width={PROFILE_W}
      height={PROFILE_H}
      style={styles.climbProfile}
      testID={`${id}-profile`}
    >
      <Defs>
        <LinearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${id}-grad)`} />
      <Path
        d={line}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
};

const CrownIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <Svg width={size} height={size * 0.8} viewBox="0 0 20 16">
    <Path d="M1 4.5 5.5 9 10 1l4.5 8L19 4.5 17 14H3L1 4.5Z" fill={color} />
  </Svg>
);

const styles = makeStyles(theme => ({
  section: { marginBottom: theme.spacing[24] },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xxl,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: theme.spacing[12],
    marginTop: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing[16],
    marginTop: -theme.spacing[4],
    marginBottom: theme.spacing[32],
    gap: theme.spacing[10],
  },
  metaLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    marginRight: theme.spacing[4],
  },
  wkgPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing[10],
    paddingVertical: theme.spacing[4],
  },
  wkgText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '800',
    color: theme.colors.text.inverse,
  },
  metaDelta: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  metaUp: { color: theme.colors.success },
  // A best / top-3 effort is the news of the ride → a banner in the power
  // colour, not a sentence lost between the meta and the tiles.
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    marginHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[12],
    paddingVertical: theme.spacing[14],
    paddingHorizontal: theme.spacing[16],
    borderRadius: theme.radii.lg,
    backgroundColor: withOpacity(theme.colors.metric.power, 0.22),
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.metric.power, 0.4),
  },
  headlineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.metric.power,
  },
  headlineText: {
    flex: 1,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '700',
    lineHeight: 20,
    color: theme.colors.text.inverse,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
    marginTop: -theme.spacing[4],
    marginBottom: theme.spacing[20],
  },
  loadingText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  skeletonStrip: {
    flexDirection: 'row',
    gap: theme.spacing[10],
    paddingHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[12],
  },
  skeletonTile: {
    width: 116,
    height: 68,
    borderRadius: theme.radii.md,
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.05),
  },
  skeletonCard: {
    marginHorizontal: theme.spacing[16],
    borderRadius: theme.radii.lg,
    padding: theme.spacing[16],
    gap: theme.spacing[14],
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.03),
  },
  skeletonLineShort: {
    width: 96,
    height: 10,
    borderRadius: 5,
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.08),
  },
  skeletonValue: {
    width: 150,
    height: 30,
    borderRadius: 8,
    marginBottom: theme.spacing[6],
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.08),
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.06),
  },
  statStrip: { marginBottom: theme.spacing[12] },
  statStripContent: {
    paddingHorizontal: theme.spacing[16],
    gap: theme.spacing[10],
  },
  stat: {
    minWidth: 116,
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.03),
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
  },
  statLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: theme.spacing[6],
  },
  statValue: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: '800',
    color: theme.colors.text.inverse,
  },
  statUnit: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  card: {
    marginHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[12],
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.03),
    borderRadius: theme.radii.lg,
    padding: theme.spacing[16],
  },
  cardTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.45)',
    marginBottom: theme.spacing[12],
  },
  // Footer of the efforts card — a reference line, not the headline: the
  // rider's current profile FTP, W/kg and whether this ride moved it.
  // Same column rhythm as the coach's PowerProfileCard: label · bar · watts · meta.
  effortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[10],
  },
  effortLabel: {
    width: 50,
    fontSize: theme.typography.fontSize.md,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: BAR_TRACK,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: 4 },
  fillPr: { opacity: 1 },
  fillQuiet: { opacity: 0.55 },
  effortWatts: {
    width: 56,
    textAlign: 'right',
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '800',
    color: theme.colors.text.inverse,
  },
  effortWattsMuted: { color: 'rgba(255, 255, 255, 0.3)' },
  effortMeta: { width: 84, alignItems: 'flex-end' },
  metaMuted: {
    fontSize: theme.typography.fontSize.xs,
    color: 'rgba(255, 255, 255, 0.35)',
  },
  prPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.metric.power,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing[8],
    paddingVertical: 2,
  },
  prPillText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: theme.colors.text.inverse,
  },
  badgeRank: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  badgeGap: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  footnote: {
    marginTop: theme.spacing[8],
    fontSize: theme.typography.fontSize.xs,
    color: 'rgba(255, 255, 255, 0.35)',
  },
  recentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[12],
    marginBottom: theme.spacing[8],
  },
  recentTitle: { marginBottom: 0 },
  recentTitleText: { flex: 1 },
  toggleLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
    marginRight: -theme.spacing[4],
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    padding: 3,
  },
  segment: {
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[6],
    borderRadius: 17,
  },
  segmentActive: { backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  segmentText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  segmentTextActive: { color: theme.colors.text.inverse },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verdictPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing[10],
    paddingVertical: theme.spacing[4] + 1,
  },
  verdictText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  recentWhy: {
    fontSize: theme.typography.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: theme.spacing[14],
    paddingTop: theme.spacing[12],
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    marginBottom: theme.spacing[32],
  },
  recentValue: {
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.6,
    fontWeight: '800',
    color: theme.colors.text.inverse,
  },
  recentBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing[6],
  },
  // A column per ride: bar area of fixed height (bars grow from its
  // bottom) with the watts underneath.
  recentCol: { flex: 1, height: 96 + 20, justifyContent: 'flex-end' },
  recentColRide: { marginLeft: theme.spacing[6] },
  recentBar: { width: '100%', borderRadius: 3 },
  recentBarLabel: {
    marginTop: theme.spacing[6],
    textAlign: 'center',
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  recentBarLabelRide: { fontWeight: '800' },
  climbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing[10],
  },
  climbBody: { flex: 1 },
  climbTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text.inverse,
    marginBottom: theme.spacing[4],
  },
  climbAt: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  climbProfile: { marginLeft: theme.spacing[12], alignSelf: 'center' },
  climbStats: { flexDirection: 'row', gap: theme.spacing[12] },
  climbStat: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.55)',
  },
  climbStatAccent: { color: theme.colors.metric.power, fontWeight: '800' },
}));
