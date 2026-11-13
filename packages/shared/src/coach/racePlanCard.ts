/**
 * plan_race's result (server/services/racePlans.js planRace) → the race plan
 * card of the coach chat: the course profile with its segments, what to hold
 * on each, the predicted time and the feeds. Null when the tool planned
 * nothing (an error the coach's own text explains).
 */
import type { RacePlanCardModel, RacePlanFeedItem, RacePlanSegmentItem, ToolCall } from '../types/coachUi.js';

type Payload = Record<string, unknown>;

function asPayload(value: unknown): Payload | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Payload) : null;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const list = (v: unknown): Payload[] => (Array.isArray(v) ? v : []).map(asPayload).filter((x): x is Payload => x !== null);

const KINDS = ['climb', 'flat', 'descent'] as const;

export function mapRacePlan(toolCalls: readonly ToolCall[] | undefined): RacePlanCardModel | null {
  const calls = (toolCalls ?? []).filter((c) => c.name === 'plan_race' && c.status === 'done');
  const r = calls.length ? asPayload(calls[calls.length - 1].result) : null;
  const summary = asPayload(r?.summary);
  const segments: RacePlanSegmentItem[] = list(r?.segments)
    .filter((s) => (KINDS as readonly unknown[]).includes(s.kind))
    .map((s) => ({
      kind: s.kind as RacePlanSegmentItem['kind'],
      startM: num(s.start_m),
      distanceM: num(s.distance_m),
      gradePct: num(s.grade_pct),
      lowW: num(s.low_w),
      highW: num(s.high_w),
      pctFtp: num(s.pct_ftp),
      durationS: num(s.duration_s),
      startS: num(s.start_s),
      eased: s.eased === true,
    }));
  if (!r || !summary || segments.length === 0) return null;
  const feeds: RacePlanFeedItem[] = list(r.fueling).map((f) => ({ atS: num(f.at_s), atM: num(f.at_m), carbsG: num(f.carbs_g), fluidMl: num(f.fluid_ml) }));
  const profile = (Array.isArray(r.profile) ? r.profile : [])
    .filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
    .map((p): [number, number] => [p[0], p[1]]);
  return {
    courseId: num(r.course_id),
    name: typeof r.name === 'string' ? r.name : null,
    distanceM: num(summary.distance_m),
    gainM: num(summary.gain_m),
    durationS: num(summary.duration_s),
    avgSpeedKmh: num(summary.avg_speed_kmh),
    npW: num(summary.np_w),
    intensityFactor: num(summary.if_),
    tss: num(summary.tss),
    carbsPerHour: num(summary.carbs_g_per_h),
    fluidPerHour: num(summary.fluid_ml_per_h),
    drafting: summary.drafting === true,
    profile,
    segments,
    feeds,
  };
}
