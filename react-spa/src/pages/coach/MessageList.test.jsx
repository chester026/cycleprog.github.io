import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageList from './MessageList';

const msg = (id, role, content) => ({ id, role, content, createdAt: 'x' });

describe('MessageList', () => {
  beforeEach(() => {
    // jsdom has no scrollTo on elements.
    Element.prototype.scrollTo = vi.fn();
  });

  it('renders every message and the suggestion chips once the reply has settled', () => {
    const onSuggestionPress = vi.fn();
    render(
      <MessageList
        messages={[msg('u', 'user', 'Hi'), msg('a', 'assistant', 'Hello')]}
        suggestions={[{ label: 'Plan my week' }]}
        streaming={false}
        onSuggestionPress={onSuggestionPress}
      />,
    );
    expect(screen.getByTestId('chat-bubble-user')).toHaveTextContent('Hi');
    expect(screen.getByTestId('chat-bubble-assistant')).toHaveTextContent('Hello');
    fireEvent.click(screen.getByRole('button', { name: 'Plan my week' }));
    expect(onSuggestionPress).toHaveBeenCalledWith({ label: 'Plan my week' });
  });

  it('hides the chips while streaming and scrolls to the end when the transcript grows', () => {
    const { rerender } = render(
      <MessageList messages={[msg('u', 'user', 'Hi')]} suggestions={[{ label: 'X' }]} streaming onSuggestionPress={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'X' })).not.toBeInTheDocument();
    const calls = Element.prototype.scrollTo.mock.calls.length;
    rerender(
      <MessageList messages={[msg('u', 'user', 'Hi'), msg('a', 'assistant', '')]} suggestions={[]} streaming onSuggestionPress={() => {}} />,
    );
    expect(Element.prototype.scrollTo.mock.calls.length).toBeGreaterThan(calls);
  });

  it('offers a "New messages" pill instead of scrolling when the reader is scrolled up', () => {
    const { rerender } = render(
      <MessageList messages={[msg('u', 'user', 'Hi')]} suggestions={[]} streaming={false} onSuggestionPress={() => {}} />,
    );
    const scroller = screen.getByTestId('coach-message-list');
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 });
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);

    rerender(
      <MessageList messages={[msg('u', 'user', 'Hi'), msg('a', 'assistant', 'New')]} suggestions={[]} streaming={false} onSuggestionPress={() => {}} />,
    );
    const pill = screen.getByRole('button', { name: '↓ New messages' });
    fireEvent.click(pill);
    expect(screen.queryByRole('button', { name: '↓ New messages' })).not.toBeInTheDocument();
  });
});
