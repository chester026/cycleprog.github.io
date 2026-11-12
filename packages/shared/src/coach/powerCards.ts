/**
 * Tool results → the coach chat's power cards. get_power_profile (12-week
 * profile: FTP, W/kg, best efforts) → PowerProfileCardModel;
 * get_ride_power_breakdown (one ride: NP/IF/TSS, its best efforts, climbs,
 * pacing) → RidePowerCardModel. Both null when the tool had nothing to show
 * (no power-meter rides / a ride without a meter), so the coach's own text
 * carries that case.
 */
import type {
  PowerEffortItem,
  PowerProfileCardModel,
  RidePowerCardModel,
  RidePowerClimbItem,
  RidePowerIntervalsModel,
  ToolCall,
} from '../types/coachUi.js';
import { DEFAULT_POWER_DURATIONS } from '../calc/powerProfile.js';

type Payload = Record<string, unknown>;

function asPayload(value: unknown): Payload | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Payload) : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function lastDone(toolCalls: readonly ToolCall[] | undefined, name: string): Payload | null {
  const calls = (toolCalls ?? []).filter((c) => c.name === name && c.status === 'done');
  return calls.length ? asPayload(calls[calls.length - 1].result) : null;
}

/** Climbs worth a row on a card: ≥ 500 m at ≥ 3 % net, longest first, at most this many. */
export const CARD_MAX_CLIMBS = 3;
/** A climb run whose net grade is below this is a bump + descent, not a climb. */
export const CARD_MIN_CLIMB_GRADE_PCT = 3;

export function mapPowerProfile(toolCalls: readonly ToolCall[] | undefined): PowerProfileCardModel | null {
  const r = lastDone(toolCalls, 'get_power_profile');
  if (!r) return null;
  const best = asPayload(r.bestEfforts) ?? {};
  const efforts: PowerEffortItem[] = [];
  for (const seconds of DEFAULT_POWER_DURATIONS) {
    const e = asPayload(best[String(seconds)]);
    const watts = num(e?.watts);
    if (watts !== null) efforts.push({ seconds, watts, date: typeof e?.date === 'string' ? e.date : undefined });
  }
  if (efforts.length === 0) return null;
  const ftp = asPayload(r.ftp);
  const method = ftp?.method === 'ftp20' || ftp?.method === 'ftp60' || ftp?.method === 'cp' || ftp?.method === 'manual' ? ftp.method : null;
  return {
    weeks: num(r.weeks) ?? 12,
    ftpWatts: num(ftp?.watts),
    ftpMethod: method,
    ftpDate: typeof ftp?.date === 'string' ? ftp.date : null,
    ftpEstimatedWatts: num(asPayload(ftp?.estimated)?.watts),
    wPerKg: num(r.wPerKg),
    efforts,
    ridesWithPower: num(r.ridesWithPower) ?? 0,
  };
}

/** Blocks a card draws at most — the bars stop being readable past this. */
export const CARD_MAX_BLOCKS = 12;

/**
 * `breakdown.intervals` (calc/rideIntervals.ts) → what the cards draw. Shared
 * by the coach's ride-power card and the ride screen's Intervals card. Null
 * when the ride has no blocks.
 */
export function mapRideIntervals(value: unknown): RidePowerIntervalsModel | null {
  const r = asPayload(value);
  const raw = (Array.isArray(r?.blocks) ? r.blocks : []).map(asPayload).filter((b): b is Payload => !!b && num(b.avg_w) !== null);
  if (!r || raw.length === 0) return null;
  const set = asPayload(r.set);
  const members = new Set(Array.isArray(set?.blocks) ? set.blocks : []);
  const target = asPayload(r.target);
  const low = num(target?.low);
  const high = num(target?.high);
  const vs = (v: unknown): 'below' | 'in' | 'above' | null => (v === 'below' || v === 'in' || v === 'above' ? v : null);
  // With a set, the card is the set: a stray surge or a warm-up effort next
  // to it only blurs "3 × 8:00 — 2 of 3 in target".
  const inSet = raw.filter((b) => members.has(b.index));
  const ordered = (inSet.length ? inSet : raw).slice(0, CARD_MAX_BLOCKS);
  return {
    blocks: ordered
      .map((b) => ({
        index: num(b.index) ?? 0,
        startS: num(b.start_s) ?? 0,
        durationS: num(b.duration_s) ?? 0,
        avgW: num(b.avg_w) as number,
        avgHr: num(b.avg_hr),
        inTargetPct: num(b.in_target_pct),
        vsTarget: vs(b.vs_target),
        inSet: members.has(b.index),
      }))
      .sort((a, b) => a.startS - b.startS),
    set: set
      ? {
          reps: num(set.reps) ?? members.size,
          durationS: num(set.duration_s) ?? 0,
          restS: num(set.rest_s) ?? 0,
          avgW: num(set.avg_w) ?? 0,
          fadePct: num(set.fade_pct) ?? 0,
          hits: num(set.hits),
        }
      : null,
    target: low !== null && high !== null ? { low, high, source: target?.source === 'plan' ? 'plan' : 'name' } : null,
  };
}

export function mapRidePower(toolCalls: readonly ToolCall[] | undefined): RidePowerCardModel | null {
  const r = lastDone(toolCalls, 'get_ride_power_breakdown');
  if (!r || r.source !== 'meter') return null;
  const npW = num(r.np_w);
  const avgW = num(r.avg_w);
  if (npW === null || avgW === null) return null;
  const best = asPayload(r.best_efforts_w) ?? {};
  const efforts: PowerEffortItem[] = [];
  for (const seconds of DEFAULT_POWER_DURATIONS) {
    const watts = num(best[String(seconds)]);
    if (watts !== null) efforts.push({ seconds, watts });
  }
  const climbs: RidePowerClimbItem[] = (Array.isArray(r.segments) ? r.segments : [])
    .map(asPayload)
    .filter(
      (s): s is Payload =>
        !!s && s.kind === 'climb' && (num(s.distance_m) ?? 0) >= 500 && (num(s.grade_pct) ?? 0) >= CARD_MIN_CLIMB_GRADE_PCT,
    )
    .map((s) => ({
      distanceM: num(s.distance_m) as number,
      gradePct: num(s.grade_pct) as number,
      avgW: num(s.avg_w),
      avgHr: num(s.avg_hr),
      avgSpeedKmh: num(s.avg_speed_kmh) ?? 0,
      durationS: num(s.duration_s) ?? 0,
      startS: num(s.start_s) ?? 0,
    }))
    .sort((a, b) => b.distanceM - a.distanceM)
    .slice(0, CARD_MAX_CLIMBS);
  const fade = asPayload(r.fade);
  return {
    activityId: num(r.activity_id) ?? 0,
    npW,
    avgW,
    maxW: num(r.max_w) ?? 0,
    intensityFactor: num(r.if_),
    tss: num(r.tss),
    vi: num(r.vi) ?? 1,
    ftpWatts: num(r.ftp_w),
    efforts,
    climbs,
    fadePct: num(fade?.pct),
    coastingPct: num(r.coasting_pct),
    intervals: mapRideIntervals(r.intervals),
  };
}
