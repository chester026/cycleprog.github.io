import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GoalForm from './GoalForm';

describe('GoalForm', () => {
  it('submits a new goal with the fields the user filled in', () => {
    const onSubmit = vi.fn();
    render(<GoalForm editingGoal={null} userProfile={null} saving={false} onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByText('Add New Goal')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g., Average Speed on Flat'), { target: { value: 'My distance goal' } });
    fireEvent.change(screen.getByPlaceholderText('e.g., 30'), { target: { value: '250' } });
    fireEvent.change(screen.getByPlaceholderText('e.g., km/h'), { target: { value: 'km' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Goal' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.title).toBe('My distance goal');
    expect(submitted.target_value).toBe('250');
    expect(submitted.unit).toBe('km');
    expect(submitted.goal_type).toBe('custom');
  });

  it('seeds its fields from editingGoal and switches to the ftp_vo2max layout', () => {
    const goal = {
      id: 7,
      title: 'FTP test',
      description: 'desc',
      goal_type: 'ftp_vo2max',
      unit: '',
      period: '4w',
      hr_threshold: 165,
      duration_threshold: 90,
    };
    render(<GoalForm editingGoal={goal} userProfile={null} saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('Edit Goal')).toBeInTheDocument();
    expect(screen.getByDisplayValue('FTP test')).toBeInTheDocument();
    // ftp_vo2max goals hide the plain Target Value field for an info message.
    expect(screen.queryByPlaceholderText('e.g., 30')).not.toBeInTheDocument();
    expect(screen.getByText(/calculated automatically/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Goal' })).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<GoalForm editingGoal={null} userProfile={null} saving={false} onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
