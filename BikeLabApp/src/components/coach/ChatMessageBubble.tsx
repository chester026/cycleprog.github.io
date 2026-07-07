import React from 'react';
import {StyleProp, StyleSheet, Text, TextStyle, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {ChatMessage, ToolCall} from '../../types/coach';
import {ToolCallCard} from './ToolCallCard';
import {GoalCreatedCard} from './GoalCreatedCard';
import {CalendarEventCreatedCard} from './CalendarEventCreatedCard';
import {CalendarPlanCreatedCard} from './CalendarPlanCreatedCard';
import {SyncToAppleCalendarPrompt} from './SyncToAppleCalendarPrompt';
import {RideScoreCard} from './RideScoreCard';
import {MetricComparisonCard, MetricRow} from './MetricComparisonCard';
import {SkillsDeltaCard, SkillChange} from './SkillsDeltaCard';
import {StreamingDots} from './StreamingDots';

// vs_baseline keys from get_activity_analysis -> display label/unit/which
// direction counts as "better" (mirrors the `better: 'higher'|'lower'`
// concept RideAnalyticsScreen's old baseline comparison used, so a green
// highlight here means the same thing it always has in this app).
const BASELINE_METRIC_SPECS: Record<string, {labelKey: string; unitKey: string; better: 'higher' | 'lower'}> = {
  speed_kmh: {labelKey: 'common.avgSpeed', unitKey: 'common.kmh', better: 'higher'},
  hr_bpm: {labelKey: 'common.heartRate', unitKey: 'common.bpm', better: 'lower'},
  power_watts: {labelKey: 'common.power', unitKey: 'common.watts', better: 'higher'},
  cadence_rpm: {labelKey: 'common.cadence', unitKey: 'common.rpm', better: 'higher'},
};

const SKILL_LABEL_KEYS: Record<string, string> = {
  climbing: 'skills.climbing',
  sprint: 'skills.sprint',
  endurance: 'skills.endurance',
  tempo: 'skills.tempo',
  power: 'skills.power',
  consistency: 'skills.discipline',
};

// Collapses consecutive same-name tool calls into one entry with a count —
// a "replan my week" turn commonly fires delete_calendar_event/
// create_calendar_event a dozen times in a row, and one full-width pill per
// call flooded the chat with a wall of near-identical rows. Only merges
// ADJACENT calls of the same name (not calls of the same name scattered
// throughout the turn) so the order tool calls actually happened in is
// still reflected in the pill sequence.
interface ToolCallGroup {
  name: string;
  status: ToolCall['status'];
  count: number;
  key: string;
}

function groupToolCalls(toolCalls: ToolCall[]): ToolCallGroup[] {
  const groups: ToolCallGroup[] = [];
  toolCalls.forEach((tc, i) => {
    const last = groups[groups.length - 1];
    if (last && last.name === tc.name) {
      last.count += 1;
      if (tc.status !== 'done') last.status = tc.status;
    } else {
      groups.push({name: tc.name, status: tc.status, count: 1, key: `${tc.name}-${i}`});
    }
  });
  return groups;
}

// Minimal markdown: **bold** spans and "- "/"* " bullet lines. Good enough
// for the coach's short, structured replies without pulling in a full
// markdown renderer — worth revisiting if responses get more complex
// (tables, nested lists).
function renderFormatted(content: string, style: StyleProp<TextStyle>, boldStyle: StyleProp<TextStyle>) {
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

  return <Text style={style}>{nodes}</Text>;
}

export const ChatMessageBubble: React.FC<{
  message: ChatMessage;
  onGoalPress: (goalId: number) => void;
  onCalendarEventPress?: () => void;
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
}> = ({message, onGoalPress, onCalendarEventPress, showAnalysisDetails, isFirstAnalysis}) => {
  const {t} = useTranslation();
  const isUser = message.role === 'user';
  const hasToolCalls = !isUser && !!message.toolCalls && message.toolCalls.length > 0;
  const showTyping = !isUser && !!message.streaming && !message.content && !hasToolCalls;

  const createdGoalCall = message.toolCalls?.find(
    tc => tc.name === 'create_goal' && tc.status === 'done' && tc.result?.created && tc.result?.metaGoal,
  );

  // .filter, not .find — a single "plan my week" turn commonly fires
  // several create_calendar_event tool calls in one message, and only ever
  // showing a card for the first one silently dropped the rest from the
  // chat (the events themselves were still created fine, they just had no
  // visible confirmation). One card per successful call now.
  const createdCalendarEventCalls = message.toolCalls?.filter(
    tc => tc.name === 'create_calendar_event' && tc.status === 'done' && tc.result?.event,
  ) || [];

  // Any completed get_activity_analysis result — vs RideScoreCard above,
  // which needs a non-null effort_score specifically, the comparison/skills
  // cards below key off whichever of vs_baseline/similar_ride/skills_delta
  // actually came back (any subset can be missing depending on how much
  // history the user has).
  const activityAnalysisCall = message.toolCalls?.find(
    tc => tc.name === 'get_activity_analysis' && tc.status === 'done' && !!tc.result?.activity,
  );
  const analysis = activityAnalysisCall?.result;

  const baselineRows: MetricRow[] = analysis?.vs_baseline
    ? Object.entries(analysis.vs_baseline)
        .map(([key, val]: [string, any]): MetricRow | null => {
          const spec = BASELINE_METRIC_SPECS[key];
          if (!spec) return null;
          const unit = t(spec.unitKey);
          const isPositive = spec.better === 'higher' ? val.diff > 0 : val.diff < 0;
          return {
            label: t(spec.labelKey),
            oldValue: `${val.avg} ${unit}`,
            newValue: `${val.ride} ${unit}`,
            isPositive,
          };
        })
        .filter((r): r is MetricRow => r !== null)
    : [];

  const similarRideRows: MetricRow[] = (() => {
    const similar = analysis?.similar_ride;
    const current = analysis?.activity;
    if (!similar || !current) return [];
    const rows: MetricRow[] = [
      {
        label: t('common.distance'),
        oldValue: `${similar.distance_km} ${t('common.km')}`,
        newValue: `${current.distance_km} ${t('common.km')}`,
      },
    ];
    if (similar.avg_speed_kmh && current.avg_speed_kmh) {
      rows.push({
        label: t('common.avgSpeed'),
        oldValue: `${similar.avg_speed_kmh} ${t('common.kmh')}`,
        newValue: `${current.avg_speed_kmh} ${t('common.kmh')}`,
        isPositive: current.avg_speed_kmh > similar.avg_speed_kmh,
      });
    }
    if (similar.avg_hr_bpm && current.avg_hr_bpm) {
      rows.push({
        label: t('common.heartRate'),
        oldValue: `${similar.avg_hr_bpm} ${t('common.bpm')}`,
        newValue: `${current.avg_hr_bpm} ${t('common.bpm')}`,
      });
    }
    if (similar.avg_watts && current.avg_watts) {
      rows.push({
        label: t('common.power'),
        oldValue: `${similar.avg_watts} ${t('common.watts')}`,
        newValue: `${current.avg_watts} ${t('common.watts')}`,
        isPositive: current.avg_watts > similar.avg_watts,
      });
    }
    if (similar.avg_cadence_rpm && current.avg_cadence_rpm) {
      rows.push({
        label: t('common.cadence'),
        oldValue: `${similar.avg_cadence_rpm} ${t('common.rpm')}`,
        newValue: `${current.avg_cadence_rpm} ${t('common.rpm')}`,
      });
    }
    return rows;
  })();

  const skillChanges: SkillChange[] = analysis?.skills_delta
    ? Object.entries(analysis.skills_delta).map(([key, val]: [string, any]) => ({
        name: t(SKILL_LABEL_KEYS[key] || key),
        previous: val.previous,
        current: val.current,
        diff: val.diff,
      }))
    : [];

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowCoach]}>
      {hasToolCalls && (
        <View style={styles.toolCalls}>
          {groupToolCalls(message.toolCalls!).map(group => (
            <ToolCallCard key={group.key} name={group.name} status={group.status} count={group.count} />
          ))}
        </View>
      )}

      {/* Rendered before the text bubble, not after — reads as "here's the
          number, now here's what it means" rather than an afterthought
          tacked on below the coach's analysis. Gated to the first analysis
          in the conversation — see isFirstAnalysis doc above. */}
      {isFirstAnalysis && typeof analysis?.activity?.effort_score === 'number' && (
        <RideScoreCard score={analysis.activity.effort_score} />
      )}

      {(message.content.length > 0 || showTyping) && (
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleCoach]}>
          {showTyping ? (
            <StreamingDots />
          ) : (
            renderFormatted(
              message.content,
              isUser ? styles.textUser : styles.textCoach,
              isUser ? styles.boldUser : styles.boldCoach,
            )
          )}
        </View>
      )}

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
      {(message.revealDetail ? message.revealDetail === 'vs_baseline' : showAnalysisDetails) &&
        baselineRows.length > 0 && (
          <MetricComparisonCard title={t('rideAnalytics.vsBaseline')} rows={baselineRows} />
        )}
      {(message.revealDetail ? message.revealDetail === 'similar_ride' : showAnalysisDetails) &&
        similarRideRows.length > 0 && (
          <MetricComparisonCard
            title={`${t('rideAnalytics.vs')}${analysis.similar_ride.name}`}
            subtitle={new Date(analysis.similar_ride.date).toLocaleDateString()}
            rows={similarRideRows}
          />
        )}
      {(message.revealDetail ? message.revealDetail === 'skills_delta' : showAnalysisDetails) &&
        skillChanges.length > 0 && <SkillsDeltaCard changes={skillChanges} />}

      {createdGoalCall && (
        <GoalCreatedCard
          goal={createdGoalCall.result.metaGoal}
          onPress={() => onGoalPress(createdGoalCall.result.metaGoal.id)}
        />
      )}

      {/* A single created event gets the detailed card (title, date,
          description, location). Multiple events in one turn — e.g. "plan
          my week" — collapse into one summary card instead of stacking one
          near-identical card per event; the events themselves are still all
          in the calendar, this is just the chat confirmation. */}
      {createdCalendarEventCalls.length === 1 && (
        <CalendarEventCreatedCard
          event={createdCalendarEventCalls[0].result.event}
          onPress={() => onCalendarEventPress?.()}
        />
      )}
      {createdCalendarEventCalls.length > 1 && (
        <CalendarPlanCreatedCard
          events={createdCalendarEventCalls.map(tc => tc.result.event)}
          onPress={() => onCalendarEventPress?.()}
        />
      )}

      {createdCalendarEventCalls.length > 0 && (
        <SyncToAppleCalendarPrompt events={createdCalendarEventCalls.map(tc => tc.result.event)} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: '#274dd3',
    borderBottomRightRadius: 4,
  },
  bubbleCoach: {
    backgroundColor: '#f1f1f1',
    borderBottomLeftRadius: 4,
  },
  textUser: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 21,
  },
  textCoach: {
    color: '#1a1a1a',
    fontSize: 15,
    lineHeight: 21,
  },
  boldUser: {
    fontWeight: '700',
    color: '#fff',
  },
  boldCoach: {
    fontWeight: '700',
    color: '#1a1a1a',
  },
});
