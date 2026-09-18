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
    expect(meta[0]).toEqual({hasAnalysis: false, showAnalysisDetails: false, isFirstAnalysis: false});
    expect(meta[1]).toEqual({hasAnalysis: true, showAnalysisDetails: false, isFirstAnalysis: true});
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
    expect(meta[0]).toEqual({hasAnalysis: false, showAnalysisDetails: false, isFirstAnalysis: false});
  });

  it('returns one entry per message, in order, for an empty or plain-only list', () => {
    expect(computeAnalysisMeta([])).toEqual([]);
    const meta = computeAnalysisMeta([plainMessage('u1'), plainMessage('u2', 'assistant')]);
    expect(meta).toHaveLength(2);
    expect(meta.every(m => !m.hasAnalysis && !m.showAnalysisDetails && !m.isFirstAnalysis)).toBe(true);
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
