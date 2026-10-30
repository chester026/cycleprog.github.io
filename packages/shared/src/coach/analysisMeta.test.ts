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
    expect(meta[0]).toEqual({ hasAnalysis: false, showAnalysisDetails: false, isFirstAnalysis: false, allowedCards: [] });
    expect(meta[1]).toEqual({ hasAnalysis: true, showAnalysisDetails: false, isFirstAnalysis: true, allowedCards: ['overtraining'] });
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
      allowedCards: [],
    });
  });

  it('returns one entry per message, in order, for an empty or plain-only list', () => {
    expect(computeAnalysisMeta([])).toEqual([]);
    const meta = computeAnalysisMeta([plainMessage('u1'), plainMessage('u2', 'assistant')]);
    expect(meta).toHaveLength(2);
    expect(meta.every((m) => !m.hasAnalysis && !m.showAnalysisDetails && !m.isFirstAnalysis)).toBe(true);
  });
});

function analysisWithResult(id: string, extra: Record<string, unknown> = {}): CoachChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'analysis',
    createdAt: '2024-01-01T00:00:00.000Z',
    toolCalls: [
      {
        name: 'get_activity_analysis',
        args: {},
        status: 'done',
        result: { activity: { effort_score: 71 }, vs_baseline: { speed: {} }, skills_delta: { climbing: {} }, ...extra },
      },
    ],
  };
}

function readinessMessage(id: string): CoachChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'readiness',
    createdAt: '2024-01-01T00:00:00.000Z',
    toolCalls: [{ name: 'analyze_readiness', args: {}, status: 'done', result: { connected: true } }],
  };
}

describe('computeAnalysisMeta — rich cards once per conversation', () => {
  const inputs = { hasActivities: true, hasHealthContext: true };

  it('first analysis: ride score + overtraining; second: the detail cards; third: nothing', () => {
    const meta = computeAnalysisMeta(
      [analysisWithResult('a1'), plainMessage('u2'), analysisWithResult('a2'), analysisWithResult('a3')],
      inputs
    );
    expect(meta[0].allowedCards).toEqual(['rideScore', 'overtraining']);
    expect(meta[2].allowedCards).toEqual(['vsBaseline', 'skillsDelta']);
    expect(meta[3].allowedCards).toEqual([]);
  });

  it('a similar ride in the result adds the similar-ride card once, and only with the activity block', () => {
    const similar = { similar_ride: { name: 'Sunday climb', date: '2024-01-01' } };
    const meta = computeAnalysisMeta(
      [analysisWithResult('a1'), analysisWithResult('a2', similar), analysisWithResult('a3', similar)],
      inputs
    );
    expect(meta[1].allowedCards).toEqual(['vsBaseline', 'similarRide', 'skillsDelta']);
    expect(meta[2].allowedCards).toEqual([]);
    const noActivity = computeAnalysisMeta(
      [analysisWithResult('a1'), analysisWithResult('a2', { ...similar, activity: undefined })],
      inputs
    );
    expect(noActivity[1].allowedCards).toEqual(['vsBaseline', 'skillsDelta']);
  });

  it('readiness after a first analysis: recovery card yes, overtraining chart not again', () => {
    const meta = computeAnalysisMeta([analysisWithResult('a1'), readinessMessage('r1'), readinessMessage('r2')], inputs);
    expect(meta[1].allowedCards).toEqual(['recovery']);
    expect(meta[2].allowedCards).toEqual([]);
  });

  it('an explicit reveal chip shows the detail once; a later generic analysis does not repeat it', () => {
    const meta = computeAnalysisMeta(
      [analysisWithResult('a1'), { ...analysisWithResult('a2'), revealDetail: 'vs_baseline' }, analysisWithResult('a3')],
      inputs
    );
    expect(meta[1].allowedCards).toEqual(['vsBaseline']);
    expect(meta[2].allowedCards).toEqual(['skillsDelta']);
  });

  it('no activities → no overtraining chart; no health context → no recovery card from analyze_readiness', () => {
    const meta = computeAnalysisMeta([analysisWithResult('a1'), readinessMessage('r1')], {
      hasActivities: false,
      hasHealthContext: false,
    });
    expect(meta[0].allowedCards).toEqual(['rideScore']);
    expect(meta[1].allowedCards).toEqual([]);
  });
});
