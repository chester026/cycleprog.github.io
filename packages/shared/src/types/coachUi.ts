/**
 * Client-side (UI/domain) types for the AI Coach chat, shared by the app and
 * the web client so `src/coach/*` can map tool-call results to cards for
 * both. Wire schemas for the coach REST endpoints live in `./coach.ts`.
 */

export type ChatRole = 'user' | 'assistant' | 'system';

export type ToolCallStatus = 'pending' | 'running' | 'done' | 'error';

// One tool invocation as the chat UI tracks it: `status` is client-side
// (a `tool_call` SSE event starts it 'running', the matching `tool_result`
// marks it 'done'); persisted `tool_calls` come back already 'done'.
// `result` is the executor's raw return value (server/aiCoach.js), whose
// shape differs per tool — `unknown` here, narrowed once per tool by the
// `src/coach/cards.ts` mappers so no UI code reads it directly.
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: ToolCallStatus;
}

// `AnalysisDetailType`, `SuggestionAction` and `SuggestionItem` are defined
// once as zod schemas in ./coach.ts (they also cross the wire in the SSE
// `suggestions` event); re-exported here so UI code has one import path.
import type { AnalysisDetailType, SuggestionItem } from './coach.js';
export type { AnalysisDetailType, SuggestionItem };
export type SuggestionAction = NonNullable<SuggestionItem['action']>;

// A message as rendered in the chat UI. `id` is client-generated for the
// optimistic user message and the in-progress assistant message; once the
// stream finishes the assistant message keeps its client id (the server's
// message_id is tracked separately by the chat hook).
export interface CoachChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  suggestions?: SuggestionItem[];
  createdAt: string;
  /** true while this assistant message is still streaming in */
  streaming?: boolean;
  /** true if the request failed and this message represents an error state */
  error?: boolean;
  /**
   * Set client-side (never sent to/from the server) when this assistant
   * reply was triggered by tapping a specific detail suggestion chip — the
   * bubble reveals ONLY that one card instead of every available angle.
   */
  revealDetail?: AnalysisDetailType;
}

// The activity fields the attachment picker keeps and
// `serializeAttachedActivities` turns into hidden context for the model.
export interface AttachedActivity {
  id: number;
  name: string;
  type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  average_watts?: number;
}

// The health snapshot the app sends with each chat turn (`health_context`)
// and the shape RecoveryCard renders from — source-agnostic: Apple Health
// fills every field, the Oura mapper leaves what Oura lacks null.
export interface HealthContext {
  recovery_score: number | null;
  resting_hr_bpm: number | null;
  resting_hr_baseline_bpm: number | null;
  hrv_ms: number | null;
  hrv_baseline_ms: number | null;
  sleep_hours: number | null;
  sleep_deep_pct: number | null;
  weight_kg: number | null;
  weight_trend_30d_kg: number | null;
  vo2max: number | null;
  data_freshness: string | null;
}

// Card view-models produced by `src/coach/cards.ts`.

export type CoachMemoryUpdate =
  | { type: 'remembered'; note: string }
  | { type: 'forgotten'; note: string };

export interface AddedChecklistItem {
  id: number | string;
  item: string;
  link?: string | null;
}

export type ChecklistUpdateSummary =
  | { type: 'added'; section: string; items: AddedChecklistItem[] }
  | { type: 'checked'; item: string }
  | { type: 'removed' };

export interface CompletedGoalSummary {
  goalId: number;
  title: string;
  ridesCount: number;
}

// create_goal's `result.metaGoal` — the fields GoalCreatedCard shows.
export interface CreatedGoalSummary {
  id: number;
  title: string;
  description?: string;
  tier?: string;
  target_date?: string;
}

// create_calendar_event's `result.event` (a `calendar_events` row).
export interface CreatedCalendarEvent {
  id: number;
  type: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  location?: string;
  start_time?: string;
  end_time?: string;
  goal_id?: number | null;
  goal_title?: string | null;
}

// get_activity_analysis's result (aiCoach.js): the headline activity plus
// the optional detail angles — any of the three can be missing depending on
// how much history the rider has.
export interface BaselineComparison {
  ride: number;
  avg: number;
  diff: number;
}

export interface AnalyzedActivity {
  effort_score?: number | null;
  distance_km?: number;
  avg_speed_kmh?: number | null;
  avg_hr_bpm?: number | null;
  avg_watts?: number | null;
  avg_cadence_rpm?: number | null;
  [key: string]: unknown;
}

export interface SimilarRide extends AnalyzedActivity {
  name: string;
  date: string;
}

export interface SkillDelta {
  previous: number;
  current: number;
  diff: number;
}

export interface ActivityAnalysisResult {
  activity: AnalyzedActivity;
  vs_baseline?: Record<string, BaselineComparison>;
  similar_ride?: SimilarRide | null;
  skills_delta?: Record<string, SkillDelta>;
  [key: string]: unknown;
}

// One row of a MetricComparisonCard (vs-baseline / similar-ride).
export interface MetricRow {
  label: string;
  oldValue: string;
  newValue: string;
  /** Highlights newValue as "good" when the change is in the better direction. */
  isPositive?: boolean;
}

// One cell of a SkillsDeltaCard.
export interface SkillChange {
  name: string;
  previous: number;
  current: number;
  diff: number;
}
