import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatMessageBubble, { CARD_SLOTS } from './ChatMessageBubble';

const assistant = (overrides) => ({
  id: 'a1',
  role: 'assistant',
  content: '',
  createdAt: '2026-10-10T08:00:00Z',
  ...overrides,
});

describe('ChatMessageBubble', () => {
  it('renders the rider message as a user bubble', () => {
    render(<ChatMessageBubble message={{ id: 'u1', role: 'user', content: 'Hi coach', createdAt: 'x' }} />);
    expect(screen.getByTestId('chat-bubble-user')).toHaveTextContent('Hi coach');
  });

  it('renders bold spans and bullets from the coach markdown subset', () => {
    render(<ChatMessageBubble message={assistant({ content: 'Plan:\n- **Tuesday** intervals\n- Rest' })} />);
    const bubble = screen.getByTestId('chat-bubble-assistant');
    expect(bubble.querySelector('strong')).toHaveTextContent('Tuesday');
    expect(bubble).toHaveTextContent('•Tuesday intervals');
    expect(bubble).toHaveTextContent('•Rest');
  });

  it('shows the thinking dots while streaming with no text and no tool calls', () => {
    render(<ChatMessageBubble message={assistant({ streaming: true })} />);
    expect(screen.getByRole('status', { name: 'Coach is thinking' })).toBeInTheDocument();
    expect(screen.getByTestId('chat-bubble-assistant')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders grouped tool pills with their English labels and no bubble while empty', () => {
    render(
      <ChatMessageBubble
        message={assistant({
          streaming: true,
          toolCalls: [
            { name: 'get_user_profile', args: {}, status: 'done' },
            { name: 'create_calendar_event', args: {}, status: 'running' },
            { name: 'create_calendar_event', args: {}, status: 'running' },
          ],
        })}
      />,
    );
    expect(screen.getByText('Checking your profile...')).toBeInTheDocument();
    expect(screen.getAllByText('Adding to your calendar...')).toHaveLength(1);
    expect(screen.queryByTestId('chat-bubble-assistant')).not.toBeInTheDocument();
  });

  it('calls renderCards for both slots around the text, in order, with the analysis meta', () => {
    const renderCards = vi.fn((slot) => <div data-testid={`card-${slot}`}>{slot}</div>);
    const meta = { showAnalysisDetails: true, isFirstAnalysis: false };
    const { container } = render(
      <ChatMessageBubble message={assistant({ content: 'Here you go' })} analysisMeta={meta} renderCards={renderCards} />,
    );
    expect(renderCards).toHaveBeenCalledWith(CARD_SLOTS.BEFORE_TEXT, expect.objectContaining({ analysisMeta: meta }));
    expect(renderCards).toHaveBeenCalledWith(CARD_SLOTS.AFTER_TEXT, expect.objectContaining({ analysisMeta: meta }));
    const order = Array.from(container.querySelectorAll('[data-testid]')).map((n) => n.dataset.testid);
    expect(order).toEqual(['card-beforeText', 'chat-bubble-assistant', 'card-afterText']);
  });

  it('never asks for cards on a user message', () => {
    const renderCards = vi.fn();
    render(<ChatMessageBubble message={{ id: 'u1', role: 'user', content: 'Hi', createdAt: 'x' }} renderCards={renderCards} />);
    expect(renderCards).not.toHaveBeenCalled();
  });
});
