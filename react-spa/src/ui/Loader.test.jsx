import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Loader, { Spinner } from './Loader';

describe('Loader', () => {
  it('renders a status role with a label', () => {
    render(<Loader label="Loading rides..." />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading rides...');
  });

  it('supports an inline mode without a visible label', () => {
    render(<Loader inline label="Loading" />);
    expect(screen.getByRole('status')).not.toHaveTextContent('Loading');
  });
});

describe('Spinner', () => {
  it('renders a bare status element', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
