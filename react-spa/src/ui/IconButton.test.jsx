import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IconButton from './IconButton';

describe('IconButton', () => {
  it('renders a button named by its aria-label with a hidden glyph', () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="New chat" icon="edit_square" onClick={onClick} />);
    const btn = screen.getByRole('button', { name: 'New chat' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn.querySelector('[aria-hidden="true"]')).toHaveTextContent('edit_square');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('throws without an aria-label', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<IconButton icon="close" />)).toThrow(/aria-label/);
    spy.mockRestore();
  });

  it('renders custom children when no icon name is given', () => {
    render(<IconButton aria-label="Stop generating"><span data-testid="stop" /></IconButton>);
    expect(screen.getByTestId('stop')).toBeInTheDocument();
  });
});
