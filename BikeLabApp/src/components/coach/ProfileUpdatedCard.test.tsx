import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {ProfileUpdatedCard} from './ProfileUpdatedCard';

const LABELS: Record<string, string> = {
  'coach.profileUpdatedLabel': 'Profile updated',
  'coach.profileFieldWeight': 'Weight',
  'coach.profileFieldMaxHr': 'Max HR',
  'coach.profileFieldHeight': 'Height',
  'coach.unitKg': 'kg',
  'common.bpm': 'bpm',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => LABELS[key] ?? key}),
}));

describe('ProfileUpdatedCard', () => {
  it('renders only the fields present in `updated`, joined with a middle dot', () => {
    render(<ProfileUpdatedCard updated={{weight: 78, max_hr: 186}} />);
    expect(screen.getByText('Weight 78 kg · Max HR 186 bpm')).toBeTruthy();
  });

  it('omits fields the coach did not change', () => {
    render(<ProfileUpdatedCard updated={{weight: 78, height: null}} />);
    expect(screen.getByText('Weight 78 kg')).toBeTruthy();
  });

  it('renders nothing for an unrecognized/empty update', () => {
    const {toJSON} = render(<ProfileUpdatedCard updated={{unknown_field: 'x'}} />);
    expect(toJSON()).toBeNull();
  });
});
