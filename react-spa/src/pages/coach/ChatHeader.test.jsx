import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatHeader from './ChatHeader';
import ContextBar from './ContextBar';

function renderHeader(props = {}) {
  const handlers = { onBack: vi.fn(), onNewChat: vi.fn(), onDeleteCurrent: vi.fn() };
  render(<ChatHeader {...handlers} streaming={false} hasConversation {...props} />);
  return handlers;
}

describe('ChatHeader', () => {
  it('shows the title and wires back, new chat and delete', () => {
    const { onBack, onNewChat, onDeleteCurrent } = renderHeader();
    expect(screen.getByRole('heading', { level: 1, name: 'AI Coach' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete chat' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onDeleteCurrent).toHaveBeenCalledTimes(1);
  });

  it('hides delete when there is no stored conversation yet', () => {
    renderHeader({ hasConversation: false });
    expect(screen.queryByRole('button', { name: 'Delete chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
  });

  it('disables the icon actions while a reply streams', () => {
    renderHeader({ streaming: true });
    expect(screen.getByRole('button', { name: 'Delete chat' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New chat' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Back/ })).not.toBeDisabled();
  });
});

describe('ContextBar', () => {
  it('renders nothing without an error and an alert with it', () => {
    const { container, rerender } = render(<ContextBar error={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ContextBar error="Rate limit reached" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Rate limit reached');
  });
});
