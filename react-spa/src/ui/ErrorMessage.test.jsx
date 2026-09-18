import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorMessage from './ErrorMessage';

describe('ErrorMessage', () => {
  it('renders the message with role="alert"', () => {
    render(<ErrorMessage>Something went wrong</ErrorMessage>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('renders nothing when there is no message', () => {
    render(<ErrorMessage>{null}</ErrorMessage>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('supports an inline (field-error) variant', () => {
    render(<ErrorMessage inline>Required</ErrorMessage>);
    expect(screen.getByRole('alert').className).toMatch(/inline/);
  });
});
