import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {ChatMessageBubble} from './ChatMessageBubble';
import {copyToClipboard} from '../../utils/clipboard';
import type {ChatMessage} from '../../types/coach';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('react-native-haptic-feedback', () => ({trigger: jest.fn()}));
jest.mock('../../utils/clipboard', () => ({copyToClipboard: jest.fn()}));
jest.mock('../../utils/healthService', () => ({}));
// Pulls in the native calendar module; irrelevant to bubble copying.
jest.mock('./SyncToAppleCalendarPrompt', () => ({SyncToAppleCalendarPrompt: () => null}));

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {id: 'm1', role: 'assistant', content: 'Do **3 x 10 min** tempo\n- warm up', createdAt: '2026-10-06T08:00:00.000Z', ...overrides};
}

function renderBubble(msg: ChatMessage) {
  render(<ChatMessageBubble message={msg} onGoalPress={jest.fn()} />);
}

describe('ChatMessageBubble copy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('long-press on a coach message copies its plain text, buzzes and shows "Copied"', () => {
    jest.useFakeTimers();
    renderBubble(message({}));

    fireEvent(screen.getByTestId('chat-bubble-assistant'), 'longPress');

    expect(copyToClipboard).toHaveBeenCalledWith('Do 3 x 10 min tempo\n• warm up');
    expect(ReactNativeHapticFeedback.trigger).toHaveBeenCalledWith('notificationSuccess', {enableVibrateFallback: true});
    expect(screen.getByTestId('chat-copied-label')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId('chat-copied-label')).toBeNull();
    jest.useRealTimers();
  });

  it('does not copy while the reply is still streaming', () => {
    renderBubble(message({streaming: true}));
    fireEvent(screen.getByTestId('chat-bubble-assistant'), 'longPress');
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('leaves user bubbles to native text selection', () => {
    renderBubble(message({role: 'user', content: 'How was my week?'}));

    expect(screen.UNSAFE_getAllByProps({selectable: true}).length).toBeGreaterThan(0);
    fireEvent(screen.getByTestId('chat-bubble-user'), 'longPress');
    expect(copyToClipboard).not.toHaveBeenCalled();
  });
});
