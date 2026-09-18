import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from './Button';

describe('Button', () => {
  it('renders a real <button> element', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' }).tagName).toBe('BUTTON');
  });

  it('is keyboard activatable (Enter) like any native button', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    btn.focus();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the danger variant class', () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toMatch(/danger/);
  });

  it('is disabled when disabled=true', () => {
    render(<Button disabled>Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
