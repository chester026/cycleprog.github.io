// Pure helpers for ChatMessageBubble's tool-call → card mappings, pulled out
// so they're unit-testable without rendering (see lib.test.ts).
import {ToolCall} from '../../types/coach';
import type {CoachMemoryUpdate} from './CoachMemoryCard';

// remember_about_rider/forget_about_rider (coach-memory tools) — maps their
// results to the chat card's props. remember_about_rider's result is
// `{note: {id, note, category}}` (aiCoach.js's formatCoachNote); older
// payloads (or a stubbed test double) may hand back the note text directly
// as a string, so both shapes are accepted. A limit-reached
// remember_about_rider call returns `{error: 'limit', notes: [...]}` instead
// of a note, which isn't newsworthy enough for its own card — the coach's
// reply text already explains it to the rider.
export function mapMemoryUpdates(toolCalls: ToolCall[] | undefined): CoachMemoryUpdate[] {
  return (toolCalls ?? [])
    .map((tc): CoachMemoryUpdate | null => {
      if (tc.status !== 'done') return null;
      if (tc.name === 'remember_about_rider' && tc.result?.note && !tc.result?.error) {
        const note = typeof tc.result.note === 'string' ? tc.result.note : tc.result.note.note;
        return note ? {type: 'remembered', note} : null;
      }
      if (tc.name === 'forget_about_rider' && tc.result?.deleted === true && tc.result?.note) {
        return {type: 'forgotten', note: tc.result.note};
      }
      return null;
    })
    .filter((s): s is CoachMemoryUpdate => s !== null);
}
