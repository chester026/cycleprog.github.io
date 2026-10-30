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

/**
 * The rich cards ChatMessageBubble can render above a coach reply. Each
 * kind is shown AT MOST ONCE per conversation (owner, 30.10.2026: "one rich
 * card per chat" — a power question re-ran get_activity_analysis and
 * analyze_readiness turn after turn, and every turn re-drew the comparison
 * cards and the overtraining chart). The server already avoids re-offering
 * readiness tools once they ran (routes/coach.js), but what the model calls
 * is not deterministic — this gate on the client is.
 */
export type RichCardKind = 'rideScore' | 'overtraining' | 'recovery' | 'vsBaseline' | 'similarRide' | 'skillsDelta';

export interface RichCardInputs {
  /** CoachChatScreen's cached ride list is non-empty (OvertrainingTrendCard needs it). */
  hasActivities: boolean;
  /** An Apple Health snapshot is available on this device (RecoveryCard's first source). */
  hasHealthContext: boolean;
}

const READINESS_TOOLS = new Set(['analyze_readiness', 'get_oura_readiness']);

function doneCall(m: ChatMessage, name: string) {
  return m.toolCalls?.find(tc => tc.name === name && tc.status === 'done');
}

/**
 * Which rich cards the bubble's own rules WOULD render for this message,
 * before the once-per-conversation gate. Mirrors ChatMessageBubble's data
 * checks (a card with nothing to show is not "shown").
 */
export function richCardsForMessage(
  m: ChatMessage,
  meta: {isFirstAnalysis: boolean; showAnalysisDetails: boolean},
  inputs: RichCardInputs,
): RichCardKind[] {
  if (m.role === 'user') return [];
  const out: RichCardKind[] = [];
  const analysis = doneCall(m, 'get_activity_analysis')?.result;
  if (meta.isFirstAnalysis && typeof analysis?.activity?.effort_score === 'number') out.push('rideScore');

  const readiness = m.toolCalls?.some(tc => READINESS_TOOLS.has(tc.name) && tc.status === 'done');
  if ((readiness || meta.isFirstAnalysis) && inputs.hasActivities) out.push('overtraining');

  const analyze = doneCall(m, 'analyze_readiness');
  const oura = doneCall(m, 'get_oura_readiness');
  const recovery =
    (analyze && inputs.hasHealthContext) || !!analyze?.result?.oura?.days?.length || !!oura?.result?.days?.length;
  if (recovery) out.push('recovery');

  const reveal = m.revealDetail;
  const detail = (kind: 'vs_baseline' | 'similar_ride' | 'skills_delta') =>
    reveal ? reveal === kind : meta.showAnalysisDetails;
  if (detail('vs_baseline') && analysis?.vs_baseline && Object.keys(analysis.vs_baseline).length > 0) out.push('vsBaseline');
  if (detail('similar_ride') && analysis?.similar_ride && analysis?.activity) out.push('similarRide');
  if (detail('skills_delta') && analysis?.skills_delta && Object.keys(analysis.skills_delta).length > 0) out.push('skillsDelta');
  return out;
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
  /**
   * Rich cards this message may render — the ones its own rules produce
   * MINUS every kind an earlier message in this conversation already
   * showed. ChatMessageBubble renders a card only when its kind is here.
   */
  allowedCards: RichCardKind[];
}

const DEFAULT_INPUTS: RichCardInputs = {hasActivities: true, hasHealthContext: false};

/**
 * One pass over the message list, computing each message's analysis-reveal
 * flags in order — equivalent to (but O(n) instead of O(n^2) vs) the old
 * per-row `messages.slice(0, index).filter(...)` scan CoachChatScreen used
 * to do inline on every render — and the once-per-conversation rich-card
 * gate (see RichCardKind).
 */
export function computeAnalysisMeta(messages: ChatMessage[], inputs: RichCardInputs = DEFAULT_INPUTS): AnalysisMeta[] {
  let priorAnalysisCount = 0;
  const shown = new Set<RichCardKind>();
  return messages.map(item => {
    const hasAnalysis = !!item.toolCalls?.some(tc => tc.name === 'get_activity_analysis' && tc.status === 'done');
    const showAnalysisDetails = hasAnalysis && priorAnalysisCount > 0;
    const isFirstAnalysis = hasAnalysis && priorAnalysisCount === 0;
    if (hasAnalysis) priorAnalysisCount++;
    const allowedCards = richCardsForMessage(item, {isFirstAnalysis, showAnalysisDetails}, inputs).filter(k => !shown.has(k));
    allowedCards.forEach(k => shown.add(k));
    return {hasAnalysis, showAnalysisDetails, isFirstAnalysis, allowedCards};
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
