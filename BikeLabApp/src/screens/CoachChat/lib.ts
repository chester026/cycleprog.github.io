// Pure helpers extracted from CoachChatScreen (T-5.x wave 2 decomposition) —
// no React, no hooks, unit-tested directly (see lib.test.ts).
import {AttachedActivity} from '../../components/coach/ActivityPickerModal';
import {ChatMessage, SuggestionItem} from '../../types/coach';

// Turns picked activities into a plain-text block the model reads as hidden
// context (see useCoachChat.sendMessage's `hiddenContext` option) — the
// user's own chat bubble stays free of this, only the request payload
// carries it. ~200 tokens/activity is the budget ActivityPickerModal's
// MAX_ATTACHMENTS assumes.
export function serializeAttachedActivities(activities: AttachedActivity[]): string {
  const lines = activities.map(a => {
    const date = new Date(a.start_date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const dist = (a.distance / 1000).toFixed(1);
    const duration = `${Math.floor(a.moving_time / 3600)}h${Math.floor((a.moving_time % 3600) / 60)}m`;
    const elev = Math.round(a.total_elevation_gain);
    let line = `[Activity ${a.id}] ${a.name} (${a.type}) — ${date}, ${dist}km, ${duration}, ${elev}m↑`;
    if (a.average_heartrate) line += `, avg HR ${Math.round(a.average_heartrate)}`;
    if (a.average_watts) line += `, avg ${Math.round(a.average_watts)}W`;
    return line;
  });
  return `The user has attached the following activities for context:\n${lines.join('\n')}`;
}

export interface AnalysisMeta {
  /** This message's own toolCalls include a completed get_activity_analysis. */
  hasAnalysis: boolean;
  /**
   * Show the vs-baseline/similar-ride/skills-delta cards for this message —
   * only from the SECOND occurrence of an analysis onward, so the bottom
   * suggestion chips ("compare to my average", etc.) have something to
   * invite the user into asking for the first time around. See
   * ChatMessageBubble's showAnalysisDetails doc.
   */
  showAnalysisDetails: boolean;
  /**
   * The effort score card is the "here's your ride" headline — only true on
   * the very first analysis in the conversation.
   */
  isFirstAnalysis: boolean;
}

/**
 * One pass over the message list, computing each message's analysis-reveal
 * flags in order — equivalent to (but O(n) instead of O(n^2) vs) the old
 * per-row `messages.slice(0, index).filter(...)` scan CoachChatScreen used
 * to do inline on every render.
 */
export function computeAnalysisMeta(messages: ChatMessage[]): AnalysisMeta[] {
  let priorAnalysisCount = 0;
  return messages.map(item => {
    const hasAnalysis = !!item.toolCalls?.some(tc => tc.name === 'get_activity_analysis' && tc.status === 'done');
    const showAnalysisDetails = hasAnalysis && priorAnalysisCount > 0;
    const isFirstAnalysis = hasAnalysis && priorAnalysisCount === 0;
    if (hasAnalysis) priorAnalysisCount++;
    return {hasAnalysis, showAnalysisDetails, isFirstAnalysis};
  });
}

/** The empty-chat welcome screen's fixed chip set (also reused as the CoachChatScreen fallback before any suggestions arrive). */
export function buildWelcomeSuggestions(t: (key: string) => string): SuggestionItem[] {
  return [
    {label: t('coach.suggestProgress')},
    {label: t('coach.suggestGoal')},
    {label: t('coach.suggestLastRide')},
    {label: t('coach.suggestWeekPlan')},
  ];
}

// Same most-useful prompts as the welcome screen (reusing the same i18n copy
// so the phrasing is consistent everywhere), reachable straight from the
// home hero. `prompt`, when present, is what actually gets SENT instead of
// `label` — "Show my total stats" reads fine as a chip, but the model needs
// the longer, explicit version (both all-time AND last-year, all four
// metrics) to reliably call get_activity_totals twice instead of picking
// just one period.
export function buildQuickStartSuggestions(
  t: (key: string) => string,
): (SuggestionItem & {prompt?: string})[] {
  return [
    {label: t('coach.suggestLastRide')},
    {label: t('coach.suggestProgress')},
    {label: t('coach.suggestSchedule')},
    {label: t('coach.suggestGoal')},
    {label: t('coach.suggestBikeCheck')},
    {label: t('coach.suggestTotalStats'), prompt: t('coach.suggestTotalStatsPrompt')},
  ];
}
