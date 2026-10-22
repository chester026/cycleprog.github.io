import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatInput, { MAX_MESSAGE_CHARS } from './ChatInput';

function setup(props = {}) {
  const onSend = vi.fn();
  const onCancel = vi.fn();
  const onAttachPress = vi.fn();
  render(<ChatInput onSend={onSend} onCancel={onCancel} onAttachPress={onAttachPress} streaming={false} {...props} />);
  return { onSend, onCancel, onAttachPress };
}

describe('ChatInput', () => {
  it('sends the trimmed text on Enter and clears the field', () => {
    const { onSend } = setup();
    const box = screen.getByRole('textbox', { name: 'Message your coach...' });
    fireEvent.change(box, { target: { value: '  plan my week  ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('plan my week');
    expect(box).toHaveValue('');
  });

  it('Shift+Enter does not send and the send button stays disabled when empty', () => {
    const { onSend } = setup();
    const box = screen.getByRole('textbox');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    fireEvent.change(box, { target: { value: 'line one' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
  });

  it('caps the message at the character limit', () => {
    setup();
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'x'.repeat(MAX_MESSAGE_CHARS + 50) } });
    expect(box.value).toHaveLength(MAX_MESSAGE_CHARS);
    expect(screen.getByText(`${MAX_MESSAGE_CHARS}/${MAX_MESSAGE_CHARS}`)).toBeInTheDocument();
  });

  it('shows Stop instead of Send while streaming', () => {
    const { onCancel } = setup({ streaming: true });
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('opens the picker from the paperclip and removes attachment pills', () => {
    const onRemoveAttachment = vi.fn();
    const { onAttachPress } = setup({
      attachedActivities: [{ id: 1, name: 'Morning ride' }],
      onRemoveAttachment,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Attach Activities' }));
    expect(onAttachPress).toHaveBeenCalled();
    expect(screen.getByText('Morning ride')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Morning ride' }));
    expect(onRemoveAttachment).toHaveBeenCalledWith(1);
  });
});
