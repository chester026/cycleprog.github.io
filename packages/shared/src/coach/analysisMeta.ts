/**
 * Per-message reveal flags for the ride-analysis cards (RideScoreCard first
 * time only; detail cards from the second analysis onward) and the
 * once-per-conversation gate for every rich card.
 */
import type { CoachChatMessage, ToolCall } from '../types/coachUi.js';

/**
 * The rich cards a client can render above a coach reply. Each kind is
 * shown AT MOST ONCE per conversation (owner, 30.10.2026: "one rich card per
 * chat" — a power question re-ran get_activity_analysis and
 * analyze_readiness turn after turn, and every turn re-drew the comparison
 * cards and the overtraining chart). The server already avoids re-offering
 * readiness tools once they ran (routes/coach.js), but what the model calls
 * is not deterministic — this gate on the client is.
 */
export type RichCardKind = 'rideScore' | 'overtraining' | 'recovery' | 'vsBaseline' | 'similarRide' | 'skillsDelta';

export interface RichCardInputs {
  /** The client's cached ride list is non-empty (OvertrainingTrendCard needs it). */
  hasActivities: boolean;
  /** An Apple Health snapshot is available on this device (RecoveryCard's first source). */
  hasHealthContext: boolean;
}

export interface AnalysisMeta {
  /** This message's own toolCalls include a completed get_activity_analysis. */
  hasAnalysis: boolean;
  /**
   * Show the vs-baseline/similar-ride/skills-delta cards for this message —
   * only from the SECOND occurrence of an analysis onward, so the bottom
   * suggestion chips ("compare to my average", …) have something to invite
   * the user into asking for the first time around.
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
   * showed. Clients render a card only when its kind is here.
   */
  allowedCards: RichCardKind[];
}

const READINESS_TOOLS = new Set(['analyze_readiness', 'get_oura_readiness']);

function doneCall(m: CoachChatMessage, name: string): ToolCall | undefined {
  return m.toolCalls?.find((tc) => tc.name === name && tc.status === 'done');
}

function hasKeys(v: unknown): boolean {
  return !!v && typeof v === 'object' && Object.keys(v as object).length > 0;
}

/**
 * Which rich cards the clients' own rules WOULD render for this message,
 * before the once-per-conversation gate. Mirrors the data checks in
 * BikeLabApp's ChatMessageBubble / react-spa's cards (a card with nothing to
 * show is not "shown").
 */
export function richCardsForMessage(
  m: CoachChatMessage,
  meta: { isFirstAnalysis: boolean; showAnalysisDetails: boolean },
  inputs: RichCardInputs,
): RichCardKind[] {
  if (m.role === 'user') return [];
  const out: RichCardKind[] = [];
  const analysis = doneCall(m, 'get_activity_analysis')?.result as
    | { activity?: { effort_score?: unknown }; vs_baseline?: unknown; similar_ride?: unknown; skills_delta?: unknown }
    | undefined;
  if (meta.isFirstAnalysis && typeof analysis?.activity?.effort_score === 'number') out.push('rideScore');

  const readiness = m.toolCalls?.some((tc) => READINESS_TOOLS.has(tc.name) && tc.status === 'done');
  if ((readiness || meta.isFirstAnalysis) && inputs.hasActivities) out.push('overtraining');

  const analyze = doneCall(m, 'analyze_readiness');
  const oura = doneCall(m, 'get_oura_readiness');
  const analyzeOura = (analyze?.result as { oura?: { days?: unknown[] } } | undefined)?.oura;
  const ouraDays = (oura?.result as { days?: unknown[] } | undefined)?.days;
  const recovery = (analyze && inputs.hasHealthContext) || !!analyzeOura?.days?.length || !!ouraDays?.length;
  if (recovery) out.push('recovery');

  const reveal = m.revealDetail;
  const detail = (kind: 'vs_baseline' | 'similar_ride' | 'skills_delta') =>
    reveal ? reveal === kind : meta.showAnalysisDetails;
  if (detail('vs_baseline') && hasKeys(analysis?.vs_baseline)) out.push('vsBaseline');
  if (detail('similar_ride') && !!analysis?.similar_ride && !!analysis?.activity) out.push('similarRide');
  if (detail('skills_delta') && hasKeys(analysis?.skills_delta)) out.push('skillsDelta');
  return out;
}

const DEFAULT_INPUTS: RichCardInputs = { hasActivities: true, hasHealthContext: false };

/**
 * One O(n) pass over the message list, computing each message's
 * analysis-reveal flags in order and the once-per-conversation rich-card
 * gate (see RichCardKind).
 */
export function computeAnalysisMeta(
  messages: readonly CoachChatMessage[],
  inputs: RichCardInputs = DEFAULT_INPUTS,
): AnalysisMeta[] {
  let priorAnalysisCount = 0;
  const shown = new Set<RichCardKind>();
  return messages.map((item) => {
    const hasAnalysis = !!item.toolCalls?.some(
      (tc) => tc.name === 'get_activity_analysis' && tc.status === 'done'
    );
    const showAnalysisDetails = hasAnalysis && priorAnalysisCount > 0;
    const isFirstAnalysis = hasAnalysis && priorAnalysisCount === 0;
    if (hasAnalysis) priorAnalysisCount++;
    const allowedCards = richCardsForMessage(item, { isFirstAnalysis, showAnalysisDetails }, inputs).filter(
      (k) => !shown.has(k)
    );
    allowedCards.forEach((k) => shown.add(k));
    return { hasAnalysis, showAnalysisDetails, isFirstAnalysis, allowedCards };
  });
}
