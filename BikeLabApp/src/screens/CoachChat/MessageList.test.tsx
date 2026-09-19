import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {MessageList} from './MessageList';
import {ChatMessage} from '../../types/coach';

// ChatMessageBubble pulls in a dozen coach sub-components (cards, charts,
// gradients) that are irrelevant to what THIS test checks — MessageList's
// own job is picking the right analysisMeta flags per row and wiring the
// footer suggestions, not rendering a bubble's internals. Stubbed down to
// just the props this test asserts on.
jest.mock('../../components/coach/ChatMessageBubble', () => {
  const {Text} = require('react-native');
  return {
    ChatMessageBubble: ({message, showAnalysisDetails, isFirstAnalysis}: any) => (
      <Text testID={`bubble-${message.id}`}>
        {message.content}|showDetails:{String(showAnalysisDetails)}|first:{String(isFirstAnalysis)}
      </Text>
    ),
  };
});

jest.mock('./SuggestionChips', () => {
  const {Text} = require('react-native');
  return {
    SuggestionChips: ({items}: any) => <Text testID="suggestion-chips">{items.map((i: any) => i.label).join(',')}</Text>,
  };
});

function analysisMessage(id: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: `analysis-${id}`,
    createdAt: '2024-01-01T00:00:00.000Z',
    toolCalls: [{name: 'get_activity_analysis', args: {}, status: 'done'}],
  };
}

describe('MessageList', () => {
  const listRef = {current: null};

  it('renders a 3-message fixture, revealing analysis details only from the 2nd analysis onward', () => {
    const messages: ChatMessage[] = [
      {id: 'u1', role: 'user', content: 'Analyze my last ride', createdAt: '2024-01-01T00:00:00.000Z'},
      analysisMessage('a1'),
      analysisMessage('a2'),
    ];

    render(
      <MessageList
        listRef={listRef as any}
        messages={messages}
        suggestions={[]}
        streaming={false}
        onGoalPress={jest.fn()}
        onCalendarEventPress={jest.fn()}
        onChecklistPress={jest.fn()}
        onSuggestionPress={jest.fn()}
      />,
    );

    expect(screen.getByTestId('bubble-u1').props.children.join('')).toContain('first:false');
    expect(screen.getByTestId('bubble-a1').props.children.join('')).toContain('showDetails:false');
    expect(screen.getByTestId('bubble-a1').props.children.join('')).toContain('first:true');
    expect(screen.getByTestId('bubble-a2').props.children.join('')).toContain('showDetails:true');
    expect(screen.getByTestId('bubble-a2').props.children.join('')).toContain('first:false');
  });

  it('shows the footer suggestion chips only once streaming has stopped and suggestions exist', () => {
    const messages: ChatMessage[] = [
      {id: 'u1', role: 'user', content: 'Hi', createdAt: '2024-01-01T00:00:00.000Z'},
    ];

    const {rerender} = render(
      <MessageList
        listRef={listRef as any}
        messages={messages}
        suggestions={[{label: 'Training tips'}]}
        streaming={true}
        onGoalPress={jest.fn()}
        onCalendarEventPress={jest.fn()}
        onChecklistPress={jest.fn()}
        onSuggestionPress={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('suggestion-chips')).toBeNull();

    rerender(
      <MessageList
        listRef={listRef as any}
        messages={messages}
        suggestions={[{label: 'Training tips'}]}
        streaming={false}
        onGoalPress={jest.fn()}
        onCalendarEventPress={jest.fn()}
        onChecklistPress={jest.fn()}
        onSuggestionPress={jest.fn()}
      />,
    );
    expect(screen.getByTestId('suggestion-chips')).toBeTruthy();
  });
});
