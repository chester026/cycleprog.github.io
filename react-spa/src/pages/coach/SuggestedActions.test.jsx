import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SuggestedActions from './SuggestedActions';

describe('SuggestedActions', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<SuggestedActions items={[]} onPress={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('gives the first chip the primary ring and passes the whole item back on click', () => {
    const onPress = vi.fn();
    const items = [{ label: 'Compare to my average', detail: 'vs_baseline' }, { label: 'Plan my week' }];
    render(<SuggestedActions items={items} onPress={onPress} label="Ask for:" />);
    expect(screen.getByText('Ask for:')).toBeInTheDocument();
    const first = screen.getByRole('button', { name: 'Compare to my average' });
    expect(first.className).toMatch(/primary/);
    expect(screen.getByRole('button', { name: 'Plan my week' }).className).not.toMatch(/primary/);
    fireEvent.click(first);
    expect(onPress).toHaveBeenCalledWith(items[0]);
  });

  it('disables every chip while streaming', () => {
    render(<SuggestedActions items={[{ label: 'A' }, { label: 'B' }]} onPress={() => {}} disabled />);
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  });
});
