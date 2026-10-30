import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GarageCalculators from '../GarageCalculators';

function fillNutrition({ distance = '100', elevation = '500', speed = '25', temp = '22' } = {}) {
  fireEvent.change(screen.getByLabelText(/Distance \(km\)/), { target: { value: distance } });
  fireEvent.change(screen.getByLabelText(/Elevation Gain \(m\)/), { target: { value: elevation } });
  fireEvent.change(screen.getByLabelText(/Average Speed \(km\/h\)/), { target: { value: speed } });
  fireEvent.change(screen.getByLabelText(/Temperature/), { target: { value: temp } });
}

describe('GarageCalculators', () => {
  it('computes a Cooper-test VO2max and its fitness label', () => {
    render(<GarageCalculators userProfile={null} />);

    fireEvent.change(screen.getByLabelText(/Distance in 12 min/), { target: { value: '3000' } });
    fireEvent.change(screen.getByLabelText(/Age \(years\)/), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText(/Weight \(kg\)/), { target: { value: '75' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Calculate' })[0]);

    // 3000 * 0.02241 - 11.288 = 55.94 -> 56, no age/weight/gender adjustment.
    expect(screen.getByText('VO₂max: 56 ml/kg/min')).toBeInTheDocument();
    expect(screen.getByText('Above Average')).toBeInTheDocument();
    expect(screen.getByText(/3000m in 12 min/)).toBeInTheDocument();
  });

  it('does nothing when the VO2max inputs are incomplete', () => {
    render(<GarageCalculators userProfile={null} />);
    fireEvent.change(screen.getByLabelText(/Distance in 12 min/), { target: { value: '3000' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Calculate' })[0]);
    expect(screen.queryByText(/VO₂max: /)).not.toBeInTheDocument();
  });

  it('prefills age, weight and gender from the profile', () => {
    render(<GarageCalculators userProfile={{ age: 42, weight: 68, gender: 'female' }} />);
    expect(screen.getByLabelText(/Age \(years\)/)).toHaveValue(42);
    expect(screen.getByLabelText(/Weight \(kg\)/)).toHaveValue(68);
    expect(screen.getByLabelText(/Gender/)).toHaveValue('female');
  });

  it('uses generic nutrition rates and links to the profile when no weight is known', () => {
    render(<GarageCalculators userProfile={null} />);
    expect(screen.getByRole('link', { name: /Complete your profile/ })).toHaveAttribute('href', '/profile?tab=personal');

    fillNutrition();
    fireEvent.click(screen.getAllByRole('button', { name: 'Calculate' })[1]);

    // 100 km at 25 km/h = 4 h: 600 kcal/h, 35 g carbs/h, 0.6 l/h at 22 °C.
    expect(screen.getByText('Time in motion:').parentElement).toHaveTextContent('4.00 h');
    expect(screen.getByText('Calories:').parentElement).toHaveTextContent('~2,400 kcal');
    expect(screen.getByText('Carbs:').parentElement).toHaveTextContent('~140 g');
    expect(screen.getByText('Water:').parentElement).toHaveTextContent('~2.4 l');
    expect(screen.getByText('x5')).toBeInTheDocument(); // flasks of 0.5 l
    expect(screen.getByText('x4')).toBeInTheDocument(); // gels
    expect(screen.queryByText('Calculated using profile data')).not.toBeInTheDocument();
  });

  it('personalises nutrition from the profile weight and experience level', () => {
    render(<GarageCalculators userProfile={{ weight: 70, age: 30, gender: 'male', experience_level: 'intermediate' }} />);
    expect(screen.getByText(/Personalized calculations using your profile data/)).toBeInTheDocument();

    fillNutrition();
    fireEvent.click(screen.getAllByRole('button', { name: 'Calculate' })[1]);

    // 10 kcal/kg/h * 70 kg * 4 h; 0.6 g/kg/h * 70 * 4; 0.7 l/h * 1.1 (22 °C) * 4 h.
    expect(screen.getByText('Calories:').parentElement).toHaveTextContent('~2,800 kcal');
    expect(screen.getByText('Carbs:').parentElement).toHaveTextContent('~168 g');
    expect(screen.getByText('Water:').parentElement).toHaveTextContent('~3.1 l');
    expect(screen.getByText('Calculated using profile data')).toBeInTheDocument();
  });

  it('ignores a nutrition calculation with missing inputs', () => {
    render(<GarageCalculators userProfile={null} />);
    fillNutrition({ speed: '' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Calculate' })[1]);
    expect(screen.queryByText(/Time in motion:/)).not.toBeInTheDocument();
  });
});
