import {computeAnalysisMeta, serializeAttachedActivities, buildWelcomeSuggestions, buildQuickStartSuggestions} from './lib';
import {ChatMessage} from '../../types/coach';
import {AttachedActivity} from '../../components/coach/ActivityPickerModal';

function analysisMessage(id: string, done: boolean): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'here is your ride',
    createdAt: '2024-01-01T00:00:00.000Z',
    toolCalls: [{name: 'get_activity_analysis', args: {}, status: done ? 'done' : 'running'}],
  };
}

function plainMessage(id: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return {id, role, content: 'hello', createdAt: '2024-01-01T00:00:00.000Z'};
}

describe('computeAnalysisMeta', () => {
  it('marks the first completed analysis as isFirstAnalysis, without showAnalysisDetails', () => {
    const messages = [plainMessage('u1'), analysisMessage('a1', true)];
    const meta = computeAnalysisMeta(messages);
    expect(meta[0]).toEqual({hasAnalysis: false, showAnalysisDetails: false, isFirstAnalysis: false, allowedCards: []});
    expect(meta[1]).toEqual({hasAnalysis: true, showAnalysisDetails: false, isFirstAnalysis: true, allowedCards: ['overtraining']});
  });

  it('reveals showAnalysisDetails from the second completed analysis onward', () => {
    const messages = [
      plainMessage('u1'),
      analysisMessage('a1', true),
      plainMessage('u2'),
      analysisMessage('a2', true),
    ];
    const meta = computeAnalysisMeta(messages);
    expect(meta[1]).toMatchObject({isFirstAnalysis: true, showAnalysisDetails: false});
    expect(meta[3]).toMatchObject({isFirstAnalysis: false, showAnalysisDetails: true});
  });

  it('ignores a still-running (not "done") get_activity_analysis tool call', () => {
    const messages = [analysisMessage('a1', false)];
    const meta = computeAnalysisMeta(messages);
    expect(meta[0]).toEqual({hasAnalysis: false, showAnalysisDetails: false, isFirstAnalysis: false, allowedCards: []});
  });

  it('returns one entry per message, in order, for an empty or plain-only list', () => {
    expect(computeAnalysisMeta([])).toEqual([]);
    const meta = computeAnalysisMeta([plainMessage('u1'), plainMessage('u2', 'assistant')]);
    expect(meta).toHaveLength(2);
    expect(meta.every(m => !m.hasAnalysis && !m.showAnalysisDetails && !m.isFirstAnalysis)).toBe(true);
  });
});

function analysisWithResult(id: string, extra: Record<string, unknown> = {}): ChatMessage {
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
        result: {activity: {effort_score: 71}, vs_baseline: {speed: {}}, skills_delta: {climbing: {}}, ...extra},
      },
    ],
  };
}

function readinessMessage(id: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'readiness',
    createdAt: '2024-01-01T00:00:00.000Z',
    toolCalls: [{name: 'analyze_readiness', args: {}, status: 'done', result: {connected: true}}],
  };
}

describe('computeAnalysisMeta — rich cards once per conversation', () => {
  const inputs = {hasActivities: true, hasHealthContext: true};

  it('first analysis: ride score + overtraining; second analysis: the detail cards, no repeats', () => {
    const messages = [analysisWithResult('a1'), plainMessage('u2'), analysisWithResult('a2'), analysisWithResult('a3')];
    const meta = computeAnalysisMeta(messages, inputs);
    expect(meta[0].allowedCards).toEqual(['rideScore', 'overtraining']);
    expect(meta[2].allowedCards).toEqual(['vsBaseline', 'skillsDelta']);
    expect(meta[3].allowedCards).toEqual([]);
  });

  it('readiness after a first analysis: recovery card yes, overtraining chart not again', () => {
    const messages = [analysisWithResult('a1'), readinessMessage('r1'), readinessMessage('r2')];
    const meta = computeAnalysisMeta(messages, inputs);
    expect(meta[0].allowedCards).toEqual(['rideScore', 'overtraining']);
    expect(meta[1].allowedCards).toEqual(['recovery']);
    expect(meta[2].allowedCards).toEqual([]);
  });

  it('an explicit reveal chip shows the detail once, a later generic analysis does not repeat it', () => {
    const messages = [
      analysisWithResult('a1'),
      {...analysisWithResult('a2'), revealDetail: 'vs_baseline' as const},
      analysisWithResult('a3'),
    ];
    const meta = computeAnalysisMeta(messages, inputs);
    expect(meta[1].allowedCards).toEqual(['vsBaseline']);
    expect(meta[2].allowedCards).toEqual(['skillsDelta']);
  });

  it('no activities → no overtraining chart; no health context → no recovery card from analyze_readiness', () => {
    const meta = computeAnalysisMeta([analysisWithResult('a1'), readinessMessage('r1')], {hasActivities: false, hasHealthContext: false});
    expect(meta[0].allowedCards).toEqual(['rideScore']);
    expect(meta[1].allowedCards).toEqual([]);
  });
});

describe('serializeAttachedActivities', () => {
  const activity: AttachedActivity = {
    id: 42,
    name: 'Sunday Climb',
    type: 'Ride',
    start_date: '2024-03-10T08:00:00Z',
    distance: 40200,
    moving_time: 5400,
    total_elevation_gain: 812.4,
    average_heartrate: 148.6,
    average_watts: 201.2,
  } as AttachedActivity;

  it('formats one activity with distance/duration/elevation/HR/power', () => {
    const text = serializeAttachedActivities([activity]);
    expect(text).toContain('The user has attached the following activities for context:');
    expect(text).toContain('[Activity 42] Sunday Climb (Ride)');
    expect(text).toContain('40.2km');
    expect(text).toContain('1h30m');
    expect(text).toContain('812m↑');
    expect(text).toContain('avg HR 149');
    expect(text).toContain('avg 201W');
  });

  it('omits HR/power fields when not present on the activity', () => {
    const rest: Partial<AttachedActivity> = {...activity};
    delete rest.average_heartrate;
    delete rest.average_watts;
    const text = serializeAttachedActivities([rest as AttachedActivity]);
    expect(text).not.toContain('avg HR');
    expect(text).not.toContain('avg 201W');
  });

  it('joins multiple activities with one line each', () => {
    const second = {...activity, id: 43, name: 'Monday Recovery'};
    const text = serializeAttachedActivities([activity, second]);
    expect(text.split('\n')).toHaveLength(3); // header + 2 activity lines
  });
});

describe('suggestion builders', () => {
  const t = (key: string) => key;

  it('buildWelcomeSuggestions returns 4 fixed chips', () => {
    const items = buildWelcomeSuggestions(t);
    expect(items).toHaveLength(4);
    expect(items.map(i => i.label)).toEqual([
      'coach.suggestProgress',
      'coach.suggestGoal',
      'coach.suggestLastRide',
      'coach.suggestWeekPlan',
    ]);
  });

  it('buildQuickStartSuggestions attaches an explicit `prompt` only to the total-stats chip', () => {
    const items = buildQuickStartSuggestions(t);
    const totalStats = items.find(i => i.label === 'coach.suggestTotalStats');
    expect(totalStats?.prompt).toBe('coach.suggestTotalStatsPrompt');
    expect(items.filter(i => i.prompt).length).toBe(1);
  });
});
