// Pure layout and wording behind GoalPlanCard — the goal's training plan as
// a row of weekly bars (the weeks themselves come from the shared
// goalPlanTimeline).
import type {PlanWeek} from '@bikelab/shared/calc';
import type {TFunction} from './lib';

const MINUTES_PER_HOUR = 60;

/** "45 min", "4 h", "2.5 h" — plan time to the nearest half hour. */
export function formatPlanTime(minutes: number, t: TFunction): string {
  if (minutes < MINUTES_PER_HOUR) return t('goalDetails.planMinutes', {value: Math.round(minutes)});
  const hours = Math.round((minutes / MINUTES_PER_HOUR) * 2) / 2;
  return t('goalDetails.planHours', {value: Number.isInteger(hours) ? String(hours) : hours.toFixed(1)});
}

// A week with sessions is never drawn shorter than this share of the row —
// a 30-minute week beside a 7-hour one would otherwise be a dot.
const MIN_BAR_SHARE = 0.14;
// A week without sessions (a rest week, the gap before the race) still
// holds its place in the row.
const EMPTY_BAR_SHARE = 0.06;

/** Each week's bar height as a share (0..1) of the row: its planned time against the heaviest week's. */
export function barShares(weeks: readonly PlanWeek[]): number[] {
  const max = Math.max(...weeks.map(week => week.plannedMin), 0);
  return weeks.map(week =>
    week.plannedMin <= 0 || max <= 0 ? EMPTY_BAR_SHARE : Math.max(MIN_BAR_SHARE, week.plannedMin / max),
  );
}

/** How much of a week's bar is filled: the share of its planned time that was done. */
export function doneShare(week: PlanWeek): number {
  if (week.plannedMin <= 0) return 0;
  return Math.min(1, Math.max(0, week.doneMin / week.plannedMin));
}

// The outline bars of a goal that has no plan yet — the shape a plan usually
// has, not data: load building over the weeks, an easier week every fourth,
// and a taper before the date.
const GHOST_WEEKS_DEFAULT = 12;
const GHOST_WEEKS_MAX = 26;
const GHOST_RECOVERY_EVERY = 4;
const GHOST_TAPER = [0.36, 0.57, 0.79];

export function ghostBarShares(weeksToTarget: number | null): number[] {
  const count = Math.min(Math.max(weeksToTarget ?? GHOST_WEEKS_DEFAULT, 4), GHOST_WEEKS_MAX);
  return Array.from({length: count}, (_, i) => {
    const fromEnd = count - 1 - i;
    if (fromEnd < GHOST_TAPER.length) return GHOST_TAPER[fromEnd];
    const build = 0.57 + 0.43 * (i / Math.max(1, count - 1 - GHOST_TAPER.length));
    return (i + 1) % GHOST_RECOVERY_EVERY === 0 ? build * 0.72 : build;
  });
}

// ── The captions under the bars ────────────────────────────────────────────

export const BAR_GAP_PX = 4;
export const RACE_DOT_PX = 8;
// The dot's own left margin on top of the row's gap.
const RACE_DOT_MARGIN_PX = 2;
// Width of a caption is estimated, not measured (it has to be placed before
// it is drawn): average glyph width of the 10 px caption face, regular and bold.
const CAPTION_CHAR_PX = 5.5;
const CAPTION_BOLD_CHAR_PX = 6;
// Two captions closer than this read as one.
const CAPTION_GAP_PX = 10;

export interface PlanCaption {
  key: 'current' | 'end' | 'start' | 'peak';
  text: string;
  /** The bar it sits under; 'left' / 'right' pin it to the row's edge. */
  anchor: number | 'left' | 'right';
  bold?: boolean;
}

export interface PlacedCaption extends PlanCaption {
  left: number;
  width: number;
}

/**
 * Where each caption goes in a row `width` wide: centred under its bar,
 * kept inside the row, and dropped when it would run into one placed before
 * it — so `captions` come in order of importance.
 */
export function placeCaptions(
  captions: readonly PlanCaption[],
  row: {width: number; barCount: number; hasRaceDot: boolean},
): PlacedCaption[] {
  if (row.width <= 0 || row.barCount <= 0) return [];
  const barsWidth = row.width - (row.hasRaceDot ? RACE_DOT_PX + RACE_DOT_MARGIN_PX + BAR_GAP_PX : 0);
  const barWidth = (barsWidth - BAR_GAP_PX * (row.barCount - 1)) / row.barCount;
  const placed: PlacedCaption[] = [];
  for (const caption of captions) {
    const width = Math.ceil(caption.text.length * (caption.bold ? CAPTION_BOLD_CHAR_PX : CAPTION_CHAR_PX));
    if (width > row.width) continue;
    const centre =
      typeof caption.anchor === 'number' ? caption.anchor * (barWidth + BAR_GAP_PX) + barWidth / 2 : 0;
    const wanted = caption.anchor === 'left' ? 0 : caption.anchor === 'right' ? row.width - width : centre - width / 2;
    const left = Math.round(Math.min(Math.max(0, wanted), row.width - width));
    const collides = placed.some(p => left < p.left + p.width + CAPTION_GAP_PX && p.left < left + width + CAPTION_GAP_PX);
    if (!collides) placed.push({...caption, left, width});
  }
  return placed;
}
