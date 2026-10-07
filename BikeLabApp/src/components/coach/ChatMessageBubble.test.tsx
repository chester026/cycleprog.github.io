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
