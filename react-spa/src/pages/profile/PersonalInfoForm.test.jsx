import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PersonalInfoForm from './PersonalInfoForm';

describe('PersonalInfoForm', () => {
  it('renders the Personal Information fields for the "personal" tab', () => {
    render(<PersonalInfoForm tab="personal" profile={{ height: '180' }} errors={{}} onChange={() => {}} />);
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByLabelText('Height (cm)')).toHaveValue(180);
    expect(screen.queryByLabelText('Experience Level')).not.toBeInTheDocument();
  });

  it('renders the Training Settings fields for the "training" tab', () => {
    render(<PersonalInfoForm tab="training" profile={{ experience_level: 'advanced' }} errors={{}} onChange={() => {}} />);
    expect(screen.getByText('Training Settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Experience Level')).toHaveValue('advanced');
    expect(screen.queryByLabelText('Height (cm)')).not.toBeInTheDocument();
  });

  it('calls onChange with the field name and new value', () => {
    const onChange = vi.fn();
    render(<PersonalInfoForm tab="personal" profile={{}} errors={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Height (cm)'), { target: { value: '175' } });
    expect(onChange).toHaveBeenCalledWith('height', '175');
  });

  it('shows a field error when passed one', () => {
    render(
      <PersonalInfoForm
        tab="personal"
        profile={{ height: '999' }}
        errors={{ height: 'Height must be between 100 and 250 cm' }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Height must be between 100 and 250 cm')).toBeInTheDocument();
  });
});
