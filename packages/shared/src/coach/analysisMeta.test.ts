import { describe, expect, it } from 'vitest';
import type { CoachChatMessage } from '../types/coachUi.js';
import { computeAnalysisMeta } from './analysisMeta.js';

function analysisMessage(id: string, done: boolean): CoachChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'here is your ride',
    createdAt: '2024-01-01T00:00:00.000Z',
    toolCalls: [{ name: 'get_activity_analysis', args: {}, status: done ? 'done' : 'running' }],
  };
}

function plainMessage(id: string, role: CoachChatMessage['role'] = 'user'): CoachChatMessage {
  return { id, role, content: 'hello', createdAt: '2024-01-01T00:00:00.000Z' };
}

describe('computeAnalysisMeta', () => {
  it('marks the first completed analysis as isFirstAnalysis, without showAnalysisDetails', () => {
    const meta = computeAnalysisMeta([plainMessage('u1'), analysisMessage('a1', true)]);
    expect(meta[0]).toEqual({ hasAnalysis: false, showAnalysisDetails: false, isFirstAnalysis: false });
    expect(meta[1]).toEqual({ hasAnalysis: true, showAnalysisDetails: false, isFirstAnalysis: true });
  });

  it('reveals showAnalysisDetails from the second completed analysis onward', () => {
    const meta = computeAnalysisMeta([
      plainMessage('u1'),
      analysisMessage('a1', true),
      plainMessage('u2'),
      analysisMessage('a2', true),
    ]);
    expect(meta[1]).toMatchObject({ isFirstAnalysis: true, showAnalysisDetails: false });
    expect(meta[3]).toMatchObject({ isFirstAnalysis: false, showAnalysisDetails: true });
  });

  it('ignores a still-running get_activity_analysis tool call', () => {
    expect(computeAnalysisMeta([analysisMessage('a1', false)])[0]).toEqual({
      hasAnalysis: false,
      showAnalysisDetails: false,
      isFirstAnalysis: false,
    });
  });

  it('returns one entry per message, in order, for an empty or plain-only list', () => {
    expect(computeAnalysisMeta([])).toEqual([]);
    const meta = computeAnalysisMeta([plainMessage('u1'), plainMessage('u2', 'assistant')]);
    expect(meta).toHaveLength(2);
    expect(meta.every((m) => !m.hasAnalysis && !m.showAnalysisDetails && !m.isFirstAnalysis)).toBe(true);
  });
});
