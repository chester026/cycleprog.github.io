import {mapMemoryUpdates} from './lib';
import {ToolCall} from '../../types/coach';

// Guards the "[object Object]" bug: remember_about_rider's result is
// `{note: {id, note, category}}` (aiCoach.js's formatCoachNote), so the card
// must read `.note.note`, not the object itself.
describe('mapMemoryUpdates', () => {
  it('extracts the note text from a remember_about_rider object result', () => {
    const toolCalls: ToolCall[] = [
      {name: 'remember_about_rider', args: {}, status: 'done', result: {note: {id: 1, note: 'Prefers morning rides', category: 'preference'}}},
    ];
    expect(mapMemoryUpdates(toolCalls)).toEqual([{type: 'remembered', note: 'Prefers morning rides'}]);
  });

  it('accepts a plain string note result for backward compatibility', () => {
    const toolCalls: ToolCall[] = [
      {name: 'remember_about_rider', args: {}, status: 'done', result: {note: 'Trains indoors Nov-Mar'}},
    ];
    expect(mapMemoryUpdates(toolCalls)).toEqual([{type: 'remembered', note: 'Trains indoors Nov-Mar'}]);
  });

  it('extracts the note text from a forget_about_rider result', () => {
    const toolCalls: ToolCall[] = [
      {name: 'forget_about_rider', args: {}, status: 'done', result: {deleted: true, id: 7, note: 'Knee hurts on climbs'}},
    ];
    expect(mapMemoryUpdates(toolCalls)).toEqual([{type: 'forgotten', note: 'Knee hurts on climbs'}]);
  });

  it('skips a limit-reached remember_about_rider result (no card, no crash)', () => {
    const toolCalls: ToolCall[] = [
      {name: 'remember_about_rider', args: {}, status: 'done', result: {error: 'limit', notes: []}},
    ];
    expect(mapMemoryUpdates(toolCalls)).toEqual([]);
  });

  it('skips a pending/error tool call', () => {
    const toolCalls: ToolCall[] = [
      {name: 'remember_about_rider', args: {}, status: 'running', result: undefined},
    ];
    expect(mapMemoryUpdates(toolCalls)).toEqual([]);
  });

  it('returns an empty array when there are no tool calls', () => {
    expect(mapMemoryUpdates(undefined)).toEqual([]);
  });
});
