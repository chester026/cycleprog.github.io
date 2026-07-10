import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';
import {CoachCard, StatusPill} from './CoachCardChrome';

// Rework of the "HR vs Speed" chart from src/components/HeartAnalysis.tsx —
// shown in the coach chat when analyze_readiness fires (see
// ChatMessageBubble.tsx). Previously built on react-native-gifted-charts;
// rebuilt here as a hand-rolled react-native-svg chart (smooth bezier +
// gradient area/stroke) to match the "Rich Chat Cards v2" style reference's
// chart card exactly. IMPORTANT divergence from that reference: the
// reference's demo chart normalizes each line independently to its own 0-1
// range purely for looks (its data is placeholder). Doing that here would
// destroy the whole point of this chart — HR and speed only visually
// "cross" when they're on a SHARED scale, which is what actually shows the
// "working harder for less output" overtraining pattern. So HR and speed
// (already ×5-scaled for magnitude parity, same as before) are normalized
// together against one shared min/max, exactly as the old gifted-charts
// version did.
const RECENT_WINDOW = 8; // rides considered for the divergence check
const RISE_THRESHOLD = 0.02; // >2% change counts as a real trend, not noise
const FATIGUE_DIVERGENCE_THRESHOLD = RISE_THRESHOLD * 2; // HR up >2% AND speed down >2% => >4% divergence
const RATE_MAX_DIVERGENCE = 0.15; // divergence at/above this maps to a 100% risk reading

const CHART_W = 400;
const CHART_H = 96;
const CHART_TOP = 6;
const CHART_BOT = 86;

export interface TrendActivity {
  start_date: string;
  average_heartrate?: number | null;
  average_speed?: number | null; // m/s, same unit Strava/this app stores elsewhere
}

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

// Catmull-Rom -> cubic-bezier smoothing, ported directly from the style
// reference's chart-building JS.
function smoothPath(pts: {x: number; y: number}[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// Same first-half vs second-half comparison over the most recent window as
// before, expressed as a 0-100 "risk" score — `divergence` is how much
// faster HR is climbing than speed (in percentage points); 0 or negative
// means HR and speed are moving together (or recovering), so risk floors
// at 0. Not a lab metric, just a "should I be worried" heads-up on the same
// data already in the chart.
function computeOvertrainingRate(
  hrData: number[],
  speedData: number[],
): {rate: number; fatigueDetected: boolean} | null {
  const n = Math.min(hrData.length, speedData.length);
  if (n < 4) return null;
  const recentHr = hrData.slice(-RECENT_WINDOW);
  const recentSpeed = speedData.slice(-RECENT_WINDOW);
  const half = Math.floor(recentHr.length / 2);
  if (half < 2) return null;

  const hrFirst = avg(recentHr.slice(0, half));
  const hrSecond = avg(recentHr.slice(half));
  const speedFirst = avg(recentSpeed.slice(0, half));
  const speedSecond = avg(recentSpeed.slice(half));

  const hrChangePct = hrFirst > 0 ? (hrSecond - hrFirst) / hrFirst : 0;
  const speedChangePct = speedFirst > 0 ? (speedSecond - speedFirst) / speedFirst : 0;
  const divergence = hrChangePct - speedChangePct;

  const rate = Math.max(0, Math.min(100, Math.round((divergence / RATE_MAX_DIVERGENCE) * 100)));
  const fatigueDetected = divergence > FATIGUE_DIVERGENCE_THRESHOLD;
  return {rate, fatigueDetected};
}

const RISK_BUCKETS: {min: number; key: string; color: string}[] = [
  {min: 75, key: 'coach.overtrainingHigh', color: '#D84343'},
  {min: 50, key: 'coach.overtrainingElevated', color: '#F26B1D'},
  {min: 25, key: 'coach.overtrainingModerate', color: '#F9A825'},
  {min: 0, key: 'coach.overtrainingLow', color: '#7CB342'},
];

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const OvertrainingTrendCard: React.FC<{activities: any[]}> = ({activities}) => {
  const {t} = useTranslation();

  const {hrData, scaledSpeedData, riskRate, fatigueDetected} = useMemo(() => {
    const rides = (activities || []).filter(a => ['Ride', 'VirtualRide'].includes(a.type));
    const sorted = rides.slice().sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    const last20 = sorted.slice(-20).filter(a => a.average_heartrate && a.average_speed);

    const hr = last20.map(a => a.average_heartrate);
    const speed = last20.map(a => parseFloat((a.average_speed * 3.6).toFixed(1))); // m/s -> km/h
    const scaledSpeed = speed.map(s => s * 5); // matches HeartAnalysis.tsx — keeps both lines in a comparable visual range
    const risk = computeOvertrainingRate(hr, speed);

    return {
      hrData: hr,
      scaledSpeedData: scaledSpeed,
      riskRate: risk?.rate ?? null,
      fatigueDetected: risk?.fatigueDetected ?? false,
    };
  }, [activities]);

  const paths = useMemo(() => {
    if (hrData.length < 2) return null;
    const maxValue = Math.max(...hrData, ...scaledSpeedData) * 1.1;
    const n = hrData.length;
    const xOf = (i: number) => (CHART_W / (n - 1)) * i;
    const yOf = (v: number) => CHART_BOT - (v / maxValue) * (CHART_BOT - CHART_TOP);
    const hrPts = hrData.map((v, i) => ({x: xOf(i), y: yOf(v)}));
    const spPts = scaledSpeedData.map((v, i) => ({x: xOf(i), y: yOf(v)}));
    const hrLine = smoothPath(hrPts);
    const spLine = smoothPath(spPts);
    const hrArea = `${hrLine} L ${CHART_W} ${CHART_BOT} L 0 ${CHART_BOT} Z`;
    return {hrLine, spLine, hrArea};
  }, [hrData, scaledSpeedData]);

  if (!paths) return null;

  const riskBucket =
    riskRate != null ? RISK_BUCKETS.find(b => riskRate >= b.min) || RISK_BUCKETS[RISK_BUCKETS.length - 1] : null;

  return (
    <CoachCard glow={false} wrapperStyle={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('coach.trendTitle')}</Text>
       
      </View>

      {riskRate != null && riskBucket && (
        <View style={styles.riskWrap}>
          <StatusPill
            color={riskBucket.color}
            tint={hexToRgba(riskBucket.color, 0.12)}
            label={`${t('coach.overtrainingRiskLabel')} ${riskRate}% · ${t(riskBucket.key)}`}
          />
        </View>
      )}
      {fatigueDetected && <Text style={styles.fatigueNote}>{t('coach.trendFatigueBadge')}</Text>}

      <View style={styles.chartWrapper}>
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#F5511E" stopOpacity={0.18} />
              <Stop offset="100%" stopColor="#F5511E" stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="hrStroke" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#FF6A2C" />
              <Stop offset="100%" stopColor="#F5401A" />
            </LinearGradient>
            <LinearGradient id="spStroke" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#2FB6FF" />
              <Stop offset="100%" stopColor="#0E9BEE" />
            </LinearGradient>
          </Defs>
          <Path d={paths.hrArea} fill="url(#hrFill)" stroke="none" />
          <Path
            d={paths.spLine}
            fill="none"
            stroke="url(#spStroke)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <Path
            d={paths.hrLine}
            fill="none"
            stroke="url(#hrStroke)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </Svg>
      </View>
      <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, {backgroundColor: '#F5511E'}]} />
            <Text style={styles.legendText}>{t('heartAnalysis.avgHRLabel')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, {backgroundColor: '#17A9F0'}]} />
            <Text style={styles.legendText}>{t('heartAnalysis.avgSpeedLabel')}</Text>
          </View>
        </View>
     
    </CoachCard>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    maxWidth: '100%',
    width: '100%',
    alignSelf: 'stretch',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: '#0E0E12',
  },
  legend: {
    flexDirection: 'row',
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: '#61616B',
    fontWeight: '500',
  },
  riskWrap: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  fatigueNote: {
    fontSize: 11,
    color: '#B5560A',
    marginTop: 4,
  },
  chartWrapper: {
    marginTop: 14,
  },
  caption: {
    fontSize: 11,
    color: '#AEAEB4',
    marginTop: 6,
  },
});
