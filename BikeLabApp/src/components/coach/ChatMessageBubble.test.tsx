import React from 'react';
import {render, screen} from '@testing-library/react-native';
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
