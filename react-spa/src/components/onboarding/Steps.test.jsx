import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Step1PersonalInfo from './Step1PersonalInfo';
import Step2HrZones from './Step2HrZones';
import Step3Experience from './Step3Experience';
import { INITIAL_FORM_DATA } from './lib';

describe('Step1PersonalInfo', () => {
  it('forwards each field change and shows the derived age and field errors', () => {
    const onChange = vi.fn();
    render(
      <Step1PersonalInfo
        formData={{ ...INITIAL_FORM_DATA, birth_date: '2000-06-15' }}
        errors={{ weight: 'Weight must be between 30 and 200 kg' }}
        onChange={onChange}
      />,
    );
    const expectedAge = new Date().getFullYear() - 2000 - (new Date() < new Date(`${new Date().getFullYear()}-06-15`) ? 1 : 0);
    expect(screen.getByText(`Age: ${expectedAge}`)).toBeInTheDocument();
    expect(screen.getByText('Weight must be between 30 and 200 kg')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Height (cm)'), { target: { value: '181' } });
    expect(onChange).toHaveBeenCalledWith('height', '181');
    fireEvent.change(screen.getByLabelText('Gender'), { target: { value: 'female' } });
    expect(onChange).toHaveBeenCalledWith('gender', 'female');
    fireEvent.change(screen.getByLabelText('Bike Weight (kg)'), { target: { value: '8.2' } });
    expect(onChange).toHaveBeenCalledWith('bike_weight', '8.2');
  });

  it('shows no age hint without a birth date', () => {
    render(<Step1PersonalInfo formData={INITIAL_FORM_DATA} errors={{}} onChange={() => {}} />);
    expect(screen.queryByText(/^Age:/)).not.toBeInTheDocument();
  });
});

describe('Step2HrZones', () => {
  it('lists the server-derived zones from the profile and forwards HR edits', () => {
    const onChange = vi.fn();
    render(
      <Step2HrZones
        formData={INITIAL_FORM_DATA}
        errors={{ max_hr: 'Max HR must be between 100 and 220 bpm' }}
        onChange={onChange}
        profile={{
          hr_zones: {
            basis: { max_hr: 190 },
            zones: [
              { key: 'z1', id: 1, name: 'Recovery', min: 95, max: 114 },
              { key: 'z5', id: 5, name: 'VO2max', min: 171, max: null },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText('Your Current Heart Rate Zones:')).toBeInTheDocument();
    expect(screen.getByText('Zone 1 (Recovery):')).toBeInTheDocument();
    expect(screen.getByText('95 - 114 bpm')).toBeInTheDocument();
    // An open-ended top zone shows "max+".
    expect(screen.getByText('171 - 190+ bpm')).toBeInTheDocument();
    expect(screen.getByText('Max HR must be between 100 and 220 bpm')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Resting Heart Rate (bpm)'), { target: { value: '52' } });
    expect(onChange).toHaveBeenCalledWith('resting_hr', '52');
  });

  it('omits the zones preview when the profile has none yet', () => {
    render(<Step2HrZones formData={INITIAL_FORM_DATA} errors={{}} onChange={() => {}} profile={null} />);
    expect(screen.queryByText('Your Current Heart Rate Zones:')).not.toBeInTheDocument();
    expect(screen.getByText(/Leave fields empty to estimate/)).toBeInTheDocument();
  });
});

describe('Step3Experience', () => {
  it('checks the current level and selects another by click or keyboard', () => {
    const onChange = vi.fn();
    render(<Step3Experience formData={{ ...INITIAL_FORM_DATA, experience_level: 'intermediate' }} onChange={onChange} />);
    expect(screen.getByLabelText('Intermediate')).toBeChecked();
    expect(screen.getByLabelText('Beginner')).not.toBeChecked();

    fireEvent.click(screen.getByLabelText('Advanced'));
    expect(onChange).toHaveBeenCalledWith('experience_level', 'advanced');

    const beginnerCard = screen.getByText(/New to cycling/).closest('[role="button"]');
    fireEvent.keyDown(beginnerCard, { key: ' ' });
    expect(onChange).toHaveBeenCalledWith('experience_level', 'beginner');
  });
});
