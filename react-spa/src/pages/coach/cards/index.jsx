import React from 'react';
import {
  buildBaselineRows,
  buildSimilarRideRows,
  buildSkillChanges,
  findActivityAnalysis,
  findReadinessCalls,
  mapChecklistUpdates,
  mapCompletedGoal,
  mapCreatedCalendarEvents,
  mapCreatedGoal,
  mapMemoryUpdates,
  mapProfileUpdates,
  pickRecoveryContext,
} from '@bikelab/shared/coach';
import { CARD_SLOTS } from '../ChatMessageBubble';
import { t } from '../copy';
import { CARD_ROUTES } from './routes';
import RideScoreCard from './RideScoreCard';
import OvertrainingTrendCard from './OvertrainingTrendCard';
import RecoveryCard from './RecoveryCard';
import MetricComparisonCard from './MetricComparisonCard';
import SkillsDeltaCard from './SkillsDeltaCard';
import GoalCreatedCard from './GoalCreatedCard';
import GoalCompletedCard from './GoalCompletedCard';
import CalendarEventCreatedCard from './CalendarEventCreatedCard';
import CalendarPlanCreatedCard from './CalendarPlanCreatedCard';
import AddToCalendarButton from '../../../components/AddToCalendarButton';
import ChecklistUpdatedCard from './ChecklistUpdatedCard';
import CoachMemoryCard from './CoachMemoryCard';
import ProfileUpdatedCard from './ProfileUpdatedCard';

/**
 * The analysis detail cards are withheld the FIRST time a conversation
 * analyses a ride (just the RideScoreCard + the coach's text) so the
 * follow-up chips have something to invite. A reply triggered by a detail
 * chip (`message.revealDetail`) shows ONLY that card; an organic later
 * analysis (`showAnalysisDetails`) shows every available angle, since free
 * text doesn't say which one the rider meant.
 */
function revealsDetail(message, analysisMeta, detail) {
  return message.revealDetail ? message.revealDetail === detail : Boolean(analysisMeta?.showAnalysisDetails);
}

function beforeTextCards({ message, analysisMeta, activities }) {
  const analysis = findActivityAnalysis(message.toolCalls);
  const { analyzeReadiness, ouraReadiness } = findReadinessCalls(message.toolCalls);
  const isFirstAnalysis = Boolean(analysisMeta?.isFirstAnalysis);

  // The trend chart only needs the rider's own rides, so it shows whenever
  // a readiness-shaped tool fired or on the first ride analysis — never
  // gated on a health-data connection.
  const showOvertrainingTrend = Boolean(analyzeReadiness || ouraReadiness || isFirstAnalysis);
  // Web sends no on-device health snapshot, so Oura (via the tool results) is the only source.
  const recoveryContext = pickRecoveryContext(analyzeReadiness, ouraReadiness, undefined);

  return (
    <>
      {isFirstAnalysis && typeof analysis?.activity.effort_score === 'number' ? (
        <RideScoreCard score={analysis.activity.effort_score} />
      ) : null}
      {showOvertrainingTrend && activities?.length > 0 ? <OvertrainingTrendCard activities={activities} /> : null}
      {recoveryContext ? <RecoveryCard context={recoveryContext} /> : null}
    </>
  );
}

function afterTextCards({ message, analysisMeta, navigate }) {
  const toolCalls = message.toolCalls;
  const analysis = findActivityAnalysis(toolCalls);
  const baselineRows = analysis ? buildBaselineRows(analysis, t) : [];
  const similarRideRows = analysis ? buildSimilarRideRows(analysis, t) : [];
  const skillChanges = analysis ? buildSkillChanges(analysis, t) : [];

  const createdGoal = mapCreatedGoal(toolCalls);
  const completedGoal = mapCompletedGoal(toolCalls);
  const createdEvents = mapCreatedCalendarEvents(toolCalls);
  const checklistSummaries = mapChecklistUpdates(toolCalls);
  const memoryUpdates = mapMemoryUpdates(toolCalls);
  const profileUpdates = mapProfileUpdates(toolCalls);

  const openCalendar = () => navigate(CARD_ROUTES.calendar(createdEvents[0].start_date));

  return (
    <>
      {revealsDetail(message, analysisMeta, 'vs_baseline') && baselineRows.length > 0 ? (
        <MetricComparisonCard title={t('rideAnalytics.vsBaseline')} rows={baselineRows} testId="metric-comparison-baseline" />
      ) : null}
      {revealsDetail(message, analysisMeta, 'similar_ride') && similarRideRows.length > 0 && analysis?.similar_ride ? (
        <MetricComparisonCard
          title={`${t('rideAnalytics.vs')}${analysis.similar_ride.name}`}
          subtitle={new Date(analysis.similar_ride.date).toLocaleDateString()}
          rows={similarRideRows}
          testId="metric-comparison-similar"
        />
      ) : null}
      {revealsDetail(message, analysisMeta, 'skills_delta') && skillChanges.length > 0 ? <SkillsDeltaCard changes={skillChanges} /> : null}

      {createdGoal ? <GoalCreatedCard goal={createdGoal} onPress={() => navigate(CARD_ROUTES.goal(createdGoal.id))} /> : null}
      {completedGoal ? (
        <GoalCompletedCard goal={completedGoal} onPress={() => navigate(CARD_ROUTES.goal(completedGoal.goalId))} />
      ) : null}

      {createdEvents.length === 1 ? <CalendarEventCreatedCard event={createdEvents[0]} onPress={openCalendar} /> : null}
      {createdEvents.length > 1 ? <CalendarPlanCreatedCard events={createdEvents} onPress={openCalendar} /> : null}
      {createdEvents.length > 0 ? <AddToCalendarButton events={createdEvents} /> : null}

      {/* Summaries carry no stable id (a "checked" one is just a name) and the list never reorders. */}
      {checklistSummaries.map((summary, i) => (
        <ChecklistUpdatedCard key={i} summary={summary} onPress={() => navigate(CARD_ROUTES.checklist)} />
      ))}
      {memoryUpdates.map((update, i) => (
        <CoachMemoryCard key={i} update={update} onPress={() => navigate(CARD_ROUTES.coachMemory)} />
      ))}
      {profileUpdates.map((updated, i) => (
        <ProfileUpdatedCard key={i} updated={updated} onPress={() => navigate(CARD_ROUTES.profile)} />
      ))}
    </>
  );
}

/**
 * `renderCards` for ChatMessageBubble: maps one assistant message's tool
 * results to cards in the app's order —
 *   BEFORE_TEXT: RideScore → OvertrainingTrend → Recovery
 *   AFTER_TEXT:  MetricComparison(baseline) → MetricComparison(similar) →
 *                SkillsDelta → GoalCreated → GoalCompleted →
 *                CalendarEvent (one) | CalendarPlan (several) + AddToCalendar →
 *                ChecklistUpdated ×N → CoachMemory ×N → ProfileUpdated ×N
 *
 * @param {string} slot one of CARD_SLOTS
 * @param {{message, analysisMeta, navigate, activities}} ctx
 */
export function renderCoachCards(slot, ctx) {
  if (slot === CARD_SLOTS.BEFORE_TEXT) return beforeTextCards(ctx);
  if (slot === CARD_SLOTS.AFTER_TEXT) return afterTextCards(ctx);
  return null;
}
