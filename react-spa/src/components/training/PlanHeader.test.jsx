import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanHeader } from './PlanHeader';

function renderHeader(props = {}) {
  const onViewModeChange = vi.fn();
  const onToggleProfileSettings = vi.fn();
  render(
    <PlanHeader
      viewMode="generated"
      onViewModeChange={onViewModeChange}
      onToggleProfileSettings={onToggleProfileSettings}
      {...props}
    />,
  );
  return { onViewModeChange, onToggleProfileSettings };
}

describe('PlanHeader', () => {
  it('switches between the generated and manual views', () => {
    const { onViewModeChange } = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Manual Plan' }));
    expect(onViewModeChange).toHaveBeenCalledWith('manual');
    fireEvent.click(screen.getByRole('button', { name: /AI-Generated/ }));
    expect(onViewModeChange).toHaveBeenCalledWith('generated');
  });

  it('shows the fallback-plan notice only when the server fell back', () => {
    const { rerender } = render(<PlanHeader viewMode="generated" onViewModeChange={() => {}} onToggleProfileSettings={() => {}} />);
    expect(screen.queryByText('Basic Training Plan')).not.toBeInTheDocument();

    rerender(
      <PlanHeader
        isFallbackPlan
        fallbackMessage="Set your goals to get a tailored plan."
        viewMode="generated"
        onViewModeChange={() => {}}
        onToggleProfileSettings={() => {}}
      />,
    );
    expect(screen.getByText('Basic Training Plan')).toBeInTheDocument();
    expect(screen.getByText('Set your goals to get a tailored plan.')).toBeInTheDocument();
  });

  it('reveals the "How it works?" explanation on hover', () => {
    renderHeader();
    expect(screen.queryByText(/Goal Analysis:/)).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByText('How it works?'));
    expect(screen.getByText(/Goal Analysis:/)).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByText('How it works?'));
    expect(screen.queryByText(/Goal Analysis:/)).not.toBeInTheDocument();
  });

  it('toggles the personal settings panel', () => {
    const { onToggleProfileSettings } = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Personal settings' }));
    expect(onToggleProfileSettings).toHaveBeenCalledTimes(1);
  });
});
