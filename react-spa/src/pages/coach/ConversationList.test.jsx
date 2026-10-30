import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConversationList from './ConversationList';

const conversations = [
  { id: 'a', title: 'Sunday climb', updated_at: new Date(Date.now() - 5 * 60_000).toISOString(), message_count: '6' },
  { id: 'b', title: null, updated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), message_count: 2 },
];

function setup(props = {}) {
  const handlers = { onOpen: vi.fn(), onDelete: vi.fn(), onRename: vi.fn(), onNewChat: vi.fn() };
  render(<ConversationList conversations={conversations} isLoading={false} isError={false} {...handlers} {...props} />);
  return handlers;
}

describe('ConversationList', () => {
  it('lists title or "Untitled chat" with relative time and message count', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Recent chats' })).toBeInTheDocument();
    expect(screen.getByText('Sunday climb')).toBeInTheDocument();
    expect(screen.getByText('Untitled chat')).toBeInTheDocument();
    expect(screen.getByText('5m ago · 6 msgs')).toBeInTheDocument();
    expect(screen.getByText('2h ago · 2 msgs')).toBeInTheDocument();
  });

  it('opens, deletes and starts a new chat through its callbacks', () => {
    const { onOpen, onDelete, onNewChat } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Sunday climb/ }));
    expect(onOpen).toHaveBeenCalledWith(conversations[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete chat: Untitled chat' }));
    expect(onDelete).toHaveBeenCalledWith(conversations[1]);
    fireEvent.click(screen.getByRole('button', { name: '+ New chat' }));
    expect(onNewChat).toHaveBeenCalled();
  });

  it('renames inline and submits the trimmed title on Enter', () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Rename chat: Sunday climb' }));
    const input = screen.getByRole('textbox', { name: 'Rename chat' });
    expect(input).toHaveValue('Sunday climb');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '  Hill repeats  ' } });
    fireEvent.submit(input.closest('form'));
    expect(onRename).toHaveBeenCalledWith(conversations[0], 'Hill repeats');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows loading, error and empty states', () => {
    const { unmount } = render(
      <ConversationList conversations={[]} isLoading isError={false} onOpen={() => {}} onDelete={() => {}} onRename={() => {}} onNewChat={() => {}} />,
    );
    expect(screen.getByRole('status', { name: 'Loading recent chats' })).toBeInTheDocument();
    unmount();

    const errored = render(
      <ConversationList conversations={[]} isLoading={false} isError onOpen={() => {}} onDelete={() => {}} onRename={() => {}} onNewChat={() => {}} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load your recent chats.');
    errored.unmount();

    render(
      <ConversationList conversations={[]} isLoading={false} isError={false} onOpen={() => {}} onDelete={() => {}} onRename={() => {}} onNewChat={() => {}} />,
    );
    expect(screen.getByText('No chats yet')).toBeInTheDocument();
  });
});
