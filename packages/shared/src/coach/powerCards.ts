/**
 * Tool results → the coach chat's power cards. get_power_profile (12-week
 * profile: FTP, W/kg, best efforts) → PowerProfileCardModel;
 * get_ride_power_breakdown (one ride: NP/IF/TSS, its best efforts, climbs,
 * pacing) → RidePowerCardModel. Both null when the tool had nothing to show
 * (no power-meter rides / a ride without a meter), so the coach's own text
 * carries that case.
 */
import type { PowerEffortItem, PowerProfileCardModel, RidePowerCardModel, RidePowerClimbItem, ToolCall } from '../types/coachUi.js';
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

/** Climbs worth a row on a card: ≥ 500 m, longest first, at most `max`. */
export const CARD_MAX_CLIMBS = 3;

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
    .filter((s): s is Payload => !!s && s.kind === 'climb' && (num(s.distance_m) ?? 0) >= 500)
    .map((s) => ({
      distanceM: num(s.distance_m) as number,
      gradePct: num(s.grade_pct) ?? 0,
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
  };
}
