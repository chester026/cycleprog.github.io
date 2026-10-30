/**
 * Fixed suggestion-chip sets (as i18n keys — each client translates). The
 * server's per-turn suggestions replace these once a reply has arrived.
 */

/** The empty-chat welcome chips, also the fallback before any suggestions arrive. */
export const WELCOME_SUGGESTION_KEYS = [
  'coach.suggestProgress',
  'coach.suggestGoal',
  'coach.suggestLastRide',
  'coach.suggestWeekPlan',
] as const;

export interface QuickStartSuggestionKeys {
  labelKey: string;
  /**
   * When set, THIS text is what gets sent instead of the label — "Show my
   * total stats" reads fine as a chip, but the model needs the longer,
   * explicit version (all-time AND last-year, all four metrics) to reliably
   * call get_activity_totals twice instead of picking one period.
   */
  promptKey?: string;
}

/** The home hero's quick-start chips — the welcome prompts plus schedule/bike/totals. */
export const QUICK_START_SUGGESTION_KEYS: readonly QuickStartSuggestionKeys[] = [
  { labelKey: 'coach.suggestLastRide' },
  { labelKey: 'coach.suggestProgress' },
  { labelKey: 'coach.suggestSchedule' },
  { labelKey: 'coach.suggestGoal' },
  { labelKey: 'coach.suggestBikeCheck' },
  { labelKey: 'coach.suggestTotalStats', promptKey: 'coach.suggestTotalStatsPrompt' },
];
