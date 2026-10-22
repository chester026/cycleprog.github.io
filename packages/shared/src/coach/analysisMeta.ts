/**
 * Per-message reveal flags for the ride-analysis cards (RideScoreCard first
 * time only; detail cards from the second analysis onward).
 */
import type { CoachChatMessage } from '../types/coachUi.js';

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
}

/**
 * One O(n) pass over the message list, computing each message's
 * analysis-reveal flags in order.
 */
export function computeAnalysisMeta(messages: readonly CoachChatMessage[]): AnalysisMeta[] {
  let priorAnalysisCount = 0;
  return messages.map((item) => {
    const hasAnalysis = !!item.toolCalls?.some(
      (tc) => tc.name === 'get_activity_analysis' && tc.status === 'done'
    );
    const showAnalysisDetails = hasAnalysis && priorAnalysisCount > 0;
    const isFirstAnalysis = hasAnalysis && priorAnalysisCount === 0;
    if (hasAnalysis) priorAnalysisCount++;
    return { hasAnalysis, showAnalysisDetails, isFirstAnalysis };
  });
}
