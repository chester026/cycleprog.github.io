import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';
import {ChatMessageBubble} from './ChatMessageBubble';
import type {ChatMessage} from '../../types/coach';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('../../utils/healthService', () => ({}));
// Pulls in the native calendar module; irrelevant to text selection.
jest.mock('./SyncToAppleCalendarPrompt', () => ({SyncToAppleCalendarPrompt: () => null}));

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {id: 'm1', role: 'assistant', content: 'Do **3 x 10 min** tempo\n- warm up', createdAt: '2026-10-06T08:00:00.000Z', ...overrides};
}

function renderBubble(msg: ChatMessage) {
  render(<ChatMessageBubble message={msg} onGoalPress={jest.fn()} />);
}

describe('ChatMessageBubble text selection', () => {
  it('a finished coach reply is natively selectable (iOS Copy callout), like user messages', () => {
    renderBubble(message({}));
    expect(screen.UNSAFE_getAllByProps({selectable: true}).length).toBeGreaterThan(0);
  });

  it('a streaming reply is not selectable — it re-renders on every token', () => {
    renderBubble(message({streaming: true}));
    expect(screen.UNSAFE_queryAllByProps({selectable: true})).toHaveLength(0);
  });

  it('user bubbles stay natively selectable', () => {
    renderBubble(message({role: 'user', content: 'How was my week?'}));
    expect(screen.UNSAFE_getAllByProps({selectable: true}).length).toBeGreaterThan(0);
  });
});

describe('ChatMessageBubble: the line above a reply', () => {
  const call = (name: string, status: 'done' | 'running' = 'done') => ({name, args: {}, status});

  it('names what the coach looked at, once per tool, on one quiet line', () => {
    renderBubble(message({toolCalls: [call('get_calendar'), call('get_goals_progress'), call('get_calendar')]}));
    // t() is mocked to echo the key.
    expect(screen.getByText('coach.toolCalendarTag, coach.toolGoalsProgressTag')).toBeTruthy();
    expect(screen.getByTestId('coach-mark')).toBeTruthy();
    expect(screen.queryByTestId('coach-working')).toBeNull();
  });

  it('says what is happening while a step runs, on the same line, with the mark alive', () => {
    renderBubble(
      message({
        content: '',
        streaming: true,
        toolCalls: [call('get_calendar'), call('create_calendar_event'), call('create_calendar_event', 'running')],
      }),
    );
    expect(screen.getByTestId('coach-working').props.children).toBe('coach.toolCreateCalendarEvent');
    expect(screen.getByTestId('coach-mark-live')).toBeTruthy();
    // One mark, one line: no second orb, no typing dots, no list of what is done beside it.
    expect(screen.queryByTestId('coach-mark')).toBeNull();
    expect(screen.queryByText(/Tag/)).toBeNull();
  });

  it('keeps the mark alive while the text is still arriving and stills it when the reply is done', () => {
    const {rerender} = render(
      <ChatMessageBubble message={message({content: 'So far', streaming: true, toolCalls: [call('get_calendar')]})} onGoalPress={jest.fn()} />,
    );
    expect(screen.getByTestId('coach-mark-live')).toBeTruthy();
    expect(screen.getByText('coach.toolCalendarTag')).toBeTruthy();
    rerender(<ChatMessageBubble message={message({content: 'So far, done', toolCalls: [call('get_calendar')]})} onGoalPress={jest.fn()} />);
    expect(screen.getByTestId('coach-mark')).toBeTruthy();
    expect(screen.queryByTestId('coach-mark-live')).toBeNull();
  });

  it('a reply that used no tools carries the coach\'s name; a rider\'s message has no such line', () => {
    renderBubble(message({}));
    expect(screen.getByText('coach.headerTitle')).toBeTruthy();
    renderBubble(message({id: 'm2', role: 'user', content: 'How was my week?'}));
    expect(screen.queryByTestId('coach-reply-meta')).toBeNull();
  });

  it('every tool label in the copy has its short tag, in both languages', () => {
    for (const copy of [require('../../i18n/en.json'), require('../../i18n/ru.json')]) {
      const labels = Object.keys(copy.coach).filter(key => /^tool[A-Z]/.test(key) && !key.endsWith('Tag'));
      expect(labels.length).toBeGreaterThan(30);
      for (const key of labels) {
        expect(copy.coach[`${key}Tag`]).toEqual(expect.any(String));
      }
    }
  });
});

describe('ChatMessageBubble power cards', () => {
  const profileCall = {
    name: 'get_power_profile',
    args: {},
    status: 'done' as const,
    result: {weeks: 12, ridesWithPower: 9, bestEfforts: {5: {watts: 800, date: '2026-10-01'}, 1200: {watts: 250, date: '2026-10-14'}}, ftp: {watts: 238, method: 'ftp20', date: '2026-10-14'}, wPerKg: 3.4},
  };
  const rideCall = {
    name: 'get_ride_power_breakdown',
    args: {},
    status: 'done' as const,
    result: {activity_id: 7, source: 'meter', np_w: 221, avg_w: 198, max_w: 740, vi: 1.12, if_: 0.89, tss: 119, best_efforts_w: {5: 740, 1200: 245}, segments: [], fade: {pct: -11.4}, coasting_pct: 9},
  };

  it('renders the profile and ride cards from their tool results', () => {
    renderBubble(message({toolCalls: [profileCall, rideCall]}));
    expect(screen.getByTestId('power-profile-card')).toBeTruthy();
    expect(screen.getByTestId('ride-power-card')).toBeTruthy();
  });

  it('respects the once-per-conversation gate and skips a meterless ride', () => {
    renderBubble(message({toolCalls: [profileCall, {...rideCall, result: {...rideCall.result, source: 'none'}}]}));
    expect(screen.getByTestId('power-profile-card')).toBeTruthy();
    expect(screen.queryByTestId('ride-power-card')).toBeNull();
    screen.unmount();
    render(<ChatMessageBubble message={message({toolCalls: [profileCall]})} onGoalPress={jest.fn()} allowedCards={[]} />);
    expect(screen.queryByTestId('power-profile-card')).toBeNull();
  });
});

describe('ChatMessageBubble race plans', () => {
  // The least plan_race answers for a course (services/racePlans.js planRace).
  const plan = (courseId: number, name: string) => ({
    name: 'plan_race',
    args: {course_id: courseId},
    status: 'done' as const,
    result: {
      course_id: courseId,
      name,
      distance_km: 90,
      elevation_gain_m: 1500,
      summary: {distance_m: 90000, gain_m: 1500, duration_s: 12000, avg_speed_kmh: 27, np_w: 170, if_: 0.8, tss: 210, carbs_g_per_h: 80, fluid_ml_per_h: 500, drafting: true},
      segments: [{index: 1, kind: 'flat', start_m: 0, distance_m: 90000, grade_pct: 0.2, low_w: 150, high_w: 170, pct_ftp: 85, duration_s: 12000, start_s: 0, eased: false}],
      fueling: [],
      profile: [[0, 100], [90000, 120]],
    },
  });

  it('draws a card for every stage planned in the reply, in order, and one for a stage planned twice', () => {
    renderBubble(message({toolCalls: [plan(21, 'Stage 1'), plan(22, 'Stage 2'), plan(21, 'Stage 1')]}));
    expect(screen.getAllByTestId('race-plan-card')).toHaveLength(2);
    expect(screen.getByText('Stage 1')).toBeTruthy();
    expect(screen.getByText('Stage 2')).toBeTruthy();
  });
});

describe('ChatMessageBubble: the reply and the rider\'s note', () => {
  it('draws "Label: number" bullets as rows between the text', () => {
    renderBubble(message({content: 'Your zones:\n- Z2: 102–137 W\n- Tempo: 138–165 W\nRide mostly Z2.'}));
    expect(screen.getByTestId('chat-reply-rows')).toBeTruthy();
    expect(screen.getByText('Z2')).toBeTruthy();
    expect(screen.getByText('138–165 W')).toBeTruthy();
    expect(screen.getByText('Ride mostly Z2.')).toBeTruthy();
  });

  it('shows a changed number with the old one struck through before it', () => {
    renderBubble(message({content: 'Обновил метрики:\n- Дистанция: 1200 км вместо 400 км\n- Средняя мощность: 183 Вт вместо 230 Вт'}));
    const old = screen.getByText('400');
    expect(old.props.style).toMatchObject({textDecorationLine: 'line-through'});
    expect(screen.getByText('230')).toBeTruthy();
    expect(screen.queryByText(/вместо/)).toBeNull();
  });

  it('folds a long note of the rider\'s to five lines until asked for; a short one has no toggle', () => {
    renderBubble(message({role: 'user', content: 'Take this plan:\n' + 'Week of rides\n'.repeat(12)}));
    const folded = () => screen.UNSAFE_queryAllByProps({numberOfLines: 5}).length > 0;
    expect(folded()).toBe(true);
    fireEvent.press(screen.getByTestId('chat-note-toggle'));
    expect(folded()).toBe(false);
    expect(screen.getByText('coach.showLess')).toBeTruthy();

    renderBubble(message({id: 'm2', role: 'user', content: 'Ok, add it'}));
    expect(screen.queryByTestId('chat-note-toggle')).toBeNull();
  });
});

describe('ChatMessageBubble: a very long reply', () => {
  const plan = Array.from({length: 18}, (_, i) => `Week ${i + 1}\n- Tue: 3×8′ tempo, steady\n- Thu: 60′ easy\n- Sat: long ride in the hills, eat on the bike`).join('\n\n');

  it('shows its opening with "Show more" when it comes from the history, and all of it on a tap', () => {
    renderBubble(message({content: plan}));
    expect(screen.getByText(/Week 1/)).toBeTruthy();
    expect(screen.queryByText(/Week 18/)).toBeNull();
    fireEvent.press(screen.getByTestId('chat-reply-toggle'));
    expect(screen.getByText(/Week 18/)).toBeTruthy();
    expect(screen.getByText('coach.showLess')).toBeTruthy();
  });

  it('stays open while it is being written and after it ends; a short reply has no toggle', () => {
    const {rerender} = render(<ChatMessageBubble message={message({content: plan, streaming: true})} onGoalPress={jest.fn()} />);
    expect(screen.getByText(/Week 18/)).toBeTruthy();
    expect(screen.queryByTestId('chat-reply-toggle')).toBeNull();
    rerender(<ChatMessageBubble message={message({content: plan, streaming: false})} onGoalPress={jest.fn()} />);
    expect(screen.getByText(/Week 18/)).toBeTruthy();
    expect(screen.getByText('coach.showLess')).toBeTruthy();

    renderBubble(message({id: 'm2'}));
    expect(screen.queryByTestId('chat-reply-toggle')).toBeNull();
  });

  it('draws a markdown heading as a bold line without its hashes', () => {
    renderBubble(message({content: 'Plan below.\n### Weeks 1–4 — base\n- Tue: easy'}));
    expect(screen.getByText('Weeks 1–4 — base')).toBeTruthy();
    expect(screen.queryByText(/###/)).toBeNull();
  });
});
