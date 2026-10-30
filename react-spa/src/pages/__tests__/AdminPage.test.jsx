import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminPage from '../AdminPage';

// Each tab has its own test file; the shell only has to mount the chosen one.
vi.mock('../admin/UsersTab', () => ({ default: () => <div data-testid="tab">users</div> }));
vi.mock('../admin/StravaTab', () => ({ default: () => <div data-testid="tab">strava</div> }));
vi.mock('../admin/HeroImagesTab', () => ({ default: () => <div data-testid="tab">hero</div> }));
vi.mock('../admin/AiUsageTab', () => ({ default: () => <div data-testid="tab">ai-usage</div> }));
vi.mock('../../components/Footer', () => ({ default: () => null }));

describe('AdminPage', () => {
  it('starts on Users and switches tabs, mounting exactly one tab at a time', () => {
    render(<AdminPage />);
    expect(screen.getAllByTestId('tab')).toHaveLength(1);
    expect(screen.getByTestId('tab')).toHaveTextContent('users');

    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Users', 'Strava', 'Hero Images', 'AI Usage']);

    fireEvent.click(screen.getByRole('button', { name: 'Hero Images' }));
    expect(screen.getByTestId('tab')).toHaveTextContent('hero');

    fireEvent.click(screen.getByRole('button', { name: 'AI Usage' }));
    expect(screen.getByTestId('tab')).toHaveTextContent('ai-usage');

    fireEvent.click(screen.getByRole('button', { name: 'Strava' }));
    expect(screen.getByTestId('tab')).toHaveTextContent('strava');
  });
});
