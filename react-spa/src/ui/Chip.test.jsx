import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Chip from './Chip';

describe('Chip', () => {
  it('is a real button and fires onClick', () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Plan my week</Chip>);
    const chip = screen.getByRole('button', { name: 'Plan my week' });
    expect(chip.tagName).toBe('BUTTON');
    expect(chip).toHaveAttribute('type', 'button');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the primary (gradient ring) variant class', () => {
    render(<Chip variant="primary">First</Chip>);
    expect(screen.getByRole('button', { name: 'First' }).className).toMatch(/primary/);
  });

  it('respects disabled', () => {
    render(<Chip disabled>Nope</Chip>);
    expect(screen.getByRole('button', { name: 'Nope' })).toBeDisabled();
  });
});
