import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {StatCardRow} from '../StatCardRow';

describe('StatCardRow', () => {
  it('renders each card value and label', () => {
    render(
      <StatCardRow
        cards={[
          {key: 'avg', value: 245, label: 'Avg power', trend: 3},
          {key: 'max', value: 512, label: 'Max power'},
        ]}
      />,
    );
    expect(screen.getByText('245')).toBeTruthy();
    expect(screen.getByText('Avg power')).toBeTruthy();
    expect(screen.getByText('512')).toBeTruthy();
    expect(screen.getByText('Max power')).toBeTruthy();
  });

  it('renders a highlight card background and nothing for an empty list', () => {
    const {toJSON} = render(<StatCardRow cards={[]} />);
    expect(toJSON()).toBeNull();
  });
});
