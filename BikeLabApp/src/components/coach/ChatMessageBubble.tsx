import React from 'react';
import {StyleProp, Text, TextStyle, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles} from '../../theme';
import {ChatMessage} from '../../types/coach';
import type {Activity} from '../../types/activity';
import {
  buildBaselineRows,
  buildSimilarRideRows,
  buildSkillChanges,
  findActivityAnalysis,
  findReadinessCalls,
  groupToolCalls,
  mapChecklistUpdates,
  mapCompletedGoal,
  mapCreatedCalendarEvents,
  mapCreatedGoal,
  mapMemoryUpdates,
  mapProfileUpdates,
  pickRecoveryContext,
} from '@bikelab/shared/coach';
import {ToolCallCard} from './ToolCallCard';
import {GoalCreatedCard} from './GoalCreatedCard';
import {GoalCompletedCard} from './GoalCompletedCard';
import {CalendarEventCreatedCard} from './CalendarEventCreatedCard';
import {ChecklistUpdatedCard} from './ChecklistUpdatedCard';
import {CoachMemoryCard} from './CoachMemoryCard';
import {ProfileUpdatedCard} from './ProfileUpdatedCard';
import {CalendarPlanCreatedCard} from './CalendarPlanCreatedCard';
import {SyncToAppleCalendarPrompt} from './SyncToAppleCalendarPrompt';
import {RideScoreCard} from './RideScoreCard';
import {MetricComparisonCard} from './MetricComparisonCard';
import {SkillsDeltaCard} from './SkillsDeltaCard';
import {RecoveryCard} from './RecoveryCard';
import {OvertrainingTrendCard} from './OvertrainingTrendCard';
import type {RichCardKind} from '@bikelab/shared/coach';
import {StreamingDots} from './StreamingDots';
import {HealthContext} from '../../utils/healthService';

// Minimal markdown: **bold** spans and "- "/"* " bullet lines. Good enough
// for the coach's short, structured replies without pulling in a full
// markdown renderer — worth revisiting if responses get more complex
// (tables, nested lists).
function renderFormatted(content: string, style: StyleProp<TextStyle>, boldStyle: StyleProp<TextStyle>, selectable = false) {
  const lines = content.length > 0 ? content.split('\n') : [''];
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    const isBullet = /^\s*[-*]\s+/.test(line);
    const cleaned = isBullet ? `•  ${line.replace(/^\s*[-*]\s+/, '')}` : line;
    const segments = cleaned.split(/(\*\*[^*]+\*\*)/g).filter(seg => seg.length > 0);

    if (segments.length === 0) {
      nodes.push(<Text key={`${lineIndex}-empty`}> </Text>);
    }

    segments.forEach((segment, segIndex) => {
      if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
        nodes.push(
          <Text key={`${lineIndex}-${segIndex}`} style={boldStyle}>
            {segment.slice(2, -2)}
          </Text>,
        );
      } else {
        nodes.push(<Text key={`${lineIndex}-${segIndex}`}>{segment}</Text>);
      }
    });

    if (lineIndex < lines.length - 1) {
      nodes.push('\n');
    }
  });

  return (
    <Text style={style} selectable={selectable}>
      {nodes}
    </Text>
  );
}

export const ChatMessageBubble: React.FC<{
  message: ChatMessage;
  onGoalPress: (goalId: number) => void;
  onCalendarEventPress?: () => void;
  onChecklistPress?: () => void;
  onProfileMemoryPress?: () => void;
  /**
   * The vs-baseline/similar-ride/skills-delta cards are withheld the FIRST
   * time get_activity_analysis returns them in a conversation — just the
   * headline RideScoreCard + the coach's text — so the chat's own follow-up
   * suggestions ("compare to my average", "how did my skills change") have
   * something to bait the user into asking for, instead of dumping every
   * angle unprompted. `CoachChatScreen` sets this true from the 2nd
   * occurrence onward (i.e. the user asked a follow-up that triggered
   * another analysis). This is only a FALLBACK for organic follow-ups that
   * didn't go through a detail chip (see `message.revealDetail` below) —
   * when it applies, every available angle shows at once since we can't
   * tell which one the rider actually meant from free text.
   */
  showAnalysisDetails?: boolean;
  /**
   * Only render RideScoreCard the first time analysis shows up in this
   * conversation — every later get_activity_analysis call also returns a
   * (usually identical) effort_score, and repeating the card on every
   * follow-up just clutters the thread with the same number again.
   */
  isFirstAnalysis?: boolean;
  /**
   * Once-per-conversation gate for the rich cards (see CoachChat/lib.ts's
   * RichCardKind) — a card renders only when its kind is listed here.
   * Undefined (tests, previews) means "no gate".
   */
  allowedCards?: RichCardKind[];
  /**
   * Client-side health snapshot + cached ride list — passed down from
   * CoachChatScreen's own useHealthData()/useAppData(), NOT read from
   * message.toolCalls. analyze_readiness's tool_call result deliberately
   * carries no real numbers (see aiCoach.js) so health data never risks
   * getting persisted into coach_messages; the actual numbers for
   * RecoveryCard/OvertrainingTrendCard always come from here instead.
   */
  healthContext?: HealthContext;
  activities?: Activity[];
}> = ({
  message,
  onGoalPress,
  onCalendarEventPress,
  onChecklistPress,
  onProfileMemoryPress,
  showAnalysisDetails,
  isFirstAnalysis,
  allowedCards,
  healthContext,
  activities,
}) => {
  const may = (kind: RichCardKind) => !allowedCards || allowedCards.includes(kind);
  const {t} = useTranslation();
  const isUser = message.role === 'user';
  const hasToolCalls = !isUser && !!message.toolCalls && message.toolCalls.length > 0;
  const showTyping = !isUser && !!message.streaming && !message.content && !hasToolCalls;

  const createdGoal = mapCreatedGoal(message.toolCalls);
  const completedGoal = mapCompletedGoal(message.toolCalls);

  // One card per successful create_calendar_event — a "plan my week" turn
  // fires several in one message, and showing only the first silently
  // dropped the rest from the chat (the events themselves were created).
  const createdCalendarEvents = mapCreatedCalendarEvents(message.toolCalls);

  // Any completed get_activity_analysis result — vs RideScoreCard below,
  // which needs a non-null effort_score specifically, the comparison/skills
  // cards key off whichever of vs_baseline/similar_ride/skills_delta
  // actually came back (any subset can be missing depending on how much
  // history the user has).
  const analysis = findActivityAnalysis(message.toolCalls);
  const baselineRows = analysis ? buildBaselineRows(analysis, t) : [];
  const similarRideRows = analysis ? buildSimilarRideRows(analysis, t) : [];
  const skillChanges = analysis ? buildSkillChanges(analysis, t) : [];

  // aiCoach.js's analyze_readiness — Apple Health numbers still come from
  // the healthContext/activities props above (never tc.result, which is why
  // an Apple-Health turn's result is just a `{connected: true}` signal), but
  // when Oura is connected instead its result carries the real Oura rows
  // too (`result.oura.days` — see recoveryContext below). Found regardless
  // of `connected`/`source` — the chart this (and get_oura_readiness, and
  // the first ride analysis) gates below needs only the rider's own rides,
  // not any health-data connection at all.
  const {analyzeReadiness: analyzeReadinessCall, ouraReadiness: ouraReadinessCall} = findReadinessCalls(
    message.toolCalls,
  );

  // The HR-vs-speed fatigue/overtraining chart only needs the rider's own
  // ride history (see OvertrainingTrendCard), so it shows whenever ANY of
  // the readiness-shaped tools fired this turn, or on the first ride
  // analysis of the conversation — never gated on an Apple Health/Oura
  // connection. Root cause of the chart "disappearing": it used to require
  // analyze_readiness AND `result.connected` (Apple Health only), so an
  // Oura rider — or a plain ride analysis — never got it.
  const showOvertrainingTrend = !!(analyzeReadinessCall || ouraReadinessCall || isFirstAnalysis);

  // RecoveryCard needs REAL numbers from one source or the other — see
  // pickRecoveryContext (shared) for the Apple-Health-first priority order.
  const recoveryContext = pickRecoveryContext(analyzeReadinessCall, ouraReadinessCall, healthContext);

  // The coach's checklist tools (add_checklist_items / update_checklist_item,
  // server tools built in parallel — see aiCoach.js) — one card per
  // successful call, same "don't drop info from a multi-call turn"
  // convention as createdCalendarEvents above. update_checklist_item
  // only gets a card for a checked-off toggle or a delete; a plain rename/
  // move/link edit isn't newsworthy enough to interrupt the chat with one.
  // See the shared mapChecklistUpdates for the result-shape mapping.
  const checklistSummaries = mapChecklistUpdates(message.toolCalls);

  // Coach-memory tools (remember_about_rider/forget_about_rider, server
  // tools built alongside coach_notes) — see the shared mapMemoryUpdates for
  // the result-shape mapping.
  const memoryUpdates = mapMemoryUpdates(message.toolCalls);

  // update_rider_profile — one card per successful call, only the fields
  // the coach actually changed. See the shared mapProfileUpdates for the
  // result-shape mapping (the tool's result is the flat updated-fields
  // object itself, not `{updated: {...}}`).
  const profileUpdates = mapProfileUpdates(message.toolCalls);

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowCoach]}>
      {hasToolCalls ? <View style={styles.toolCalls}>
          {groupToolCalls(message.toolCalls ?? []).map(group => (
            <ToolCallCard key={group.key} name={group.name} status={group.status} count={group.count} />
          ))}
        </View> : null}

      {/* Rendered before the text bubble, not after — reads as "here's the
          number, now here's what it means" rather than an afterthought
          tacked on below the coach's analysis. Gated to the first analysis
          in the conversation — see isFirstAnalysis doc above. */}
      {may('rideScore') && isFirstAnalysis && typeof analysis?.activity.effort_score === 'number' ? <RideScoreCard score={analysis.activity.effort_score} /> : null}

      {/* Right after RideScoreCard — see showOvertrainingTrend doc above for
          why this shows on any readiness-shaped tool call, not just
          Apple-Health-connected analyze_readiness. */}
      {may('overtraining') && showOvertrainingTrend && !!activities && activities.length > 0 ? <OvertrainingTrendCard activities={activities} /> : null}
      {may('recovery') && !!recoveryContext && <RecoveryCard context={recoveryContext} />}

      {/* Both bubbles use native text selection (selectable Text) — the
          iOS "Copy" callout under the finger, same as the user's own
          messages. A custom long-press + "Copied" label was tried for coach
          replies and dropped (owner, 07.10.2026): the label changed the
          row's height and read as a second, odder copy affordance. Only a
          finished reply is selectable; a streaming one re-renders on every
          token flush and would lose the selection. */}
      {(message.content.length > 0 || showTyping) ? <View
          style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleCoach]}
          testID={`chat-bubble-${message.role}`}>
          {showTyping ? (
            <StreamingDots />
          ) : (
            renderFormatted(
              message.content,
              isUser ? styles.textUser : styles.textCoach,
              isUser ? styles.boldUser : styles.boldCoach,
              isUser || !message.streaming,
            )
          )}
        </View> : null}

      {/* Supporting detail cards go after the text — the score up top is
          the headline, these are the "why" the coach is about to explain.
          Withheld on first reveal (see showAnalysisDetails doc above) so
          the bottom suggestion chips have something to invite the user
          into asking for instead of front-loading everything at once.
          When this reply came from tapping a specific detail chip
          (message.revealDetail set), show ONLY that one card — otherwise
          (an organic follow-up typed by hand) fall back to showing every
          available angle via showAnalysisDetails, since free text doesn't
          tell us which one the rider meant. */}
      {may('vsBaseline') && (message.revealDetail ? message.revealDetail === 'vs_baseline' : showAnalysisDetails) &&
        baselineRows.length > 0 ? <MetricComparisonCard title={t('rideAnalytics.vsBaseline')} rows={baselineRows} /> : null}
      {may('similarRide') && (message.revealDetail ? message.revealDetail === 'similar_ride' : showAnalysisDetails) &&
        similarRideRows.length > 0 && analysis?.similar_ride ? <MetricComparisonCard
            title={`${t('rideAnalytics.vs')}${analysis.similar_ride.name}`}
            subtitle={new Date(analysis.similar_ride.date).toLocaleDateString()}
            rows={similarRideRows}
          /> : null}
      {may('skillsDelta') && (message.revealDetail ? message.revealDetail === 'skills_delta' : showAnalysisDetails) &&
        skillChanges.length > 0 ? <SkillsDeltaCard changes={skillChanges} /> : null}

      {createdGoal ? <GoalCreatedCard goal={createdGoal} onPress={() => onGoalPress(createdGoal.id)} /> : null}

      {completedGoal ? (
        <GoalCompletedCard goal={completedGoal} onPress={() => onGoalPress(completedGoal.goalId)} />
      ) : null}

      {/* A single created event gets the detailed card (title, date,
          description, location). Multiple events in one turn — e.g. "plan
          my week" — collapse into one summary card instead of stacking one
          near-identical card per event; the events themselves are still all
          in the calendar, this is just the chat confirmation. */}
      {createdCalendarEvents.length === 1 && (
        <CalendarEventCreatedCard event={createdCalendarEvents[0]} onPress={() => onCalendarEventPress?.()} />
      )}
      {createdCalendarEvents.length > 1 && (
        <CalendarPlanCreatedCard events={createdCalendarEvents} onPress={() => onCalendarEventPress?.()} />
      )}

      {createdCalendarEvents.length > 0 && <SyncToAppleCalendarPrompt events={createdCalendarEvents} />}

      {/* Summaries carry no stable id of their own (a "checked" one is just a
          name) — index-as-key is fine here since this list never reorders. */}
      {checklistSummaries.map((summary, i) => (
        <ChecklistUpdatedCard key={i} summary={summary} onPress={() => onChecklistPress?.()} />
      ))}

      {memoryUpdates.map((update, i) => (
        <CoachMemoryCard key={i} update={update} onPress={() => onProfileMemoryPress?.()} />
      ))}

      {profileUpdates.map((updated, i) => (
        <ProfileUpdatedCard key={i} updated={updated} />
      ))}
    </View>
  );
};

const styles = makeStyles(theme => ({
  row: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  rowUser: {
    alignItems: 'flex-end',
  },
  rowCoach: {
    alignItems: 'flex-start',
  },
  toolCalls: {
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: theme.colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleCoach: {
    backgroundColor: theme.colors.coach.bubbleCoachBg,
    borderBottomLeftRadius: 4,
  },
  textUser: {
    color: theme.colors.text.inverse,
    fontSize: 15,
    lineHeight: 21,
  },
  textCoach: {
    color: theme.colors.text.primary,
    fontSize: 15,
    lineHeight: 21,
  },
  boldUser: {
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  boldCoach: {
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
}));
