/**
 * HR-vs-speed fatigue / overtraining trend for the coach chat's
 * OvertrainingTrendCard (app + web). Built from the rider's own recent rides
 * only — never gated on a health-data connection.
 *
 * The chart's point: HR and speed only visually "cross" when they share one
 * scale, which is what shows the "working harder for less output" pattern.
 * So speed is ×SPEED_SCALE for magnitude parity and both series are meant to
 * be drawn against one shared max — `buildTrendChartPaths` does exactly that;
 * never normalise the two lines independently.
 */
import { ACTIVITY_RIDE_TYPES } from '../constants/index.js';
import { OVERTRAINING_RISK_BUCKETS, type OvertrainingRiskLevel } from '../constants/coachBuckets.js';

export const TREND_RIDES_MAX = 20; // newest rides plotted
export const RECENT_WINDOW = 8; // rides considered for the divergence check
export const RISE_THRESHOLD = 0.02; // >2% change counts as a real trend, not noise
export const FATIGUE_DIVERGENCE_THRESHOLD = RISE_THRESHOLD * 2; // HR up >2% AND speed down >2%
export const RATE_MAX_DIVERGENCE = 0.15; // divergence at/above this reads as 100% risk
export const SPEED_SCALE = 5; // km/h × 5 puts speed in HR's visual range
const MS_TO_KMH = 3.6;
const HEADROOM = 1.1; // 10% above the tallest point so the line never kisses the top

export interface TrendActivity {
  type?: string | null;
  start_date: string;
  average_heartrate?: number | null;
  average_speed?: number | null; // m/s, as Strava stores it
}

export interface TrendSeries {
  /** Average HR per ride, oldest first. */
  hr: number[];
  /** Average speed per ride in km/h (1 decimal), oldest first. */
  speedKmh: number[];
}

/**
 * The newest TREND_RIDES_MAX Ride/VirtualRide activities that have both HR
 * and speed, ordered oldest → newest, as two parallel series.
 */
export function selectTrendSeries(activities: readonly TrendActivity[] | null | undefined): TrendSeries {
  const rideTypes: readonly string[] = ACTIVITY_RIDE_TYPES;
  const rides = (activities ?? []).filter((a) => rideTypes.includes(a.type ?? ''));
  const sorted = rides
    .slice()
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  const withData = sorted.slice(-TREND_RIDES_MAX).filter(hasHrAndSpeed);
  return {
    hr: withData.map((a) => a.average_heartrate),
    speedKmh: withData.map((a) => Number((a.average_speed * MS_TO_KMH).toFixed(1))),
  };
}

type RideWithHrAndSpeed = TrendActivity & { average_heartrate: number; average_speed: number };

function hasHrAndSpeed(a: TrendActivity): a is RideWithHrAndSpeed {
  return !!a.average_heartrate && !!a.average_speed;
}

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export interface OvertrainingRate {
  /** 0–100: how much faster HR is climbing than speed over the recent window. */
  rate: number;
  /** HR up and speed down by more than FATIGUE_DIVERGENCE_THRESHOLD combined. */
  fatigueDetected: boolean;
}

/**
 * First-half vs second-half comparison over the most recent RECENT_WINDOW
 * rides. `divergence` = HR change % − speed change %; ≤ 0 means HR and speed
 * move together (or the rider is recovering), so risk floors at 0. Needs at
 * least 4 rides, otherwise null. Not a lab metric — a "should I be worried"
 * heads-up on the same data the chart shows.
 */
export function computeOvertrainingRate(hrData: number[], speedData: number[]): OvertrainingRate | null {
  const n = Math.min(hrData.length, speedData.length);
  if (n < 4) return null;
  const recentHr = hrData.slice(-RECENT_WINDOW);
  const recentSpeed = speedData.slice(-RECENT_WINDOW);
  const half = Math.floor(recentHr.length / 2);

  const hrFirst = avg(recentHr.slice(0, half));
  const hrSecond = avg(recentHr.slice(half));
  const speedFirst = avg(recentSpeed.slice(0, half));
  const speedSecond = avg(recentSpeed.slice(half));

  const hrChangePct = hrFirst > 0 ? (hrSecond - hrFirst) / hrFirst : 0;
  const speedChangePct = speedFirst > 0 ? (speedSecond - speedFirst) / speedFirst : 0;
  const divergence = hrChangePct - speedChangePct;

  const rate = Math.max(0, Math.min(100, Math.round((divergence / RATE_MAX_DIVERGENCE) * 100)));
  return { rate, fatigueDetected: divergence > FATIGUE_DIVERGENCE_THRESHOLD };
}

/** Risk bucket for a 0–100 overtraining rate. */
export function getOvertrainingRiskLevel(rate: number): OvertrainingRiskLevel {
  return OVERTRAINING_RISK_BUCKETS.find((b) => rate >= b.min)?.level ?? 'low';
}

export interface ChartPoint {
  x: number;
  y: number;
}

/** Catmull-Rom → cubic-bezier SVG path through `pts`; '' for fewer than 2 points. */
export function smoothPath(pts: readonly ChartPoint[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export interface TrendChartBox {
  width: number;
  /** y of the tallest possible point (SVG coordinates grow downward). */
  top: number;
  /** y of the baseline. */
  bottom: number;
}

export interface TrendChartPaths {
  hrLine: string;
  speedLine: string;
  /** hrLine closed down to the baseline, for the gradient fill. */
  hrArea: string;
}

/**
 * SVG paths for the HR line, the ×SPEED_SCALE speed line and the HR area
 * fill, both series normalised against ONE shared max (see file header).
 * null with fewer than 2 rides — nothing to draw a line through.
 */
export function buildTrendChartPaths(series: TrendSeries, box: TrendChartBox): TrendChartPaths | null {
  const { hr } = series;
  if (hr.length < 2) return null;
  const scaledSpeed = series.speedKmh.slice(0, hr.length).map((s) => s * SPEED_SCALE);
  const maxValue = Math.max(...hr, ...scaledSpeed) * HEADROOM;
  const xOf = (i: number) => (box.width / (hr.length - 1)) * i;
  const yOf = (v: number) => box.bottom - (v / maxValue) * (box.bottom - box.top);
  const hrLine = smoothPath(hr.map((v, i) => ({ x: xOf(i), y: yOf(v) })));
  const speedLine = smoothPath(scaledSpeed.map((v, i) => ({ x: xOf(i), y: yOf(v) })));
  return {
    hrLine,
    speedLine,
    hrArea: `${hrLine} L ${box.width} ${box.bottom} L 0 ${box.bottom} Z`,
  };
}
