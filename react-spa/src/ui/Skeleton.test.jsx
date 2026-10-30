import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Skeleton from './Skeleton';

describe('Skeleton', () => {
  it('announces a labelled block as a loading status', () => {
    render(<Skeleton label="Loading FTP analysis" />);
    expect(screen.getByRole('status', { name: 'Loading FTP analysis' })).toBeInTheDocument();
  });

  it('hides unlabelled blocks from the accessibility tree', () => {
    const { container } = render(<Skeleton />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('reserves the requested box so content does not shift on load', () => {
    const { container } = render(<Skeleton width={120} height={24} radius={6} />);
    expect(container.firstChild).toHaveStyle({ width: '120px', height: '24px', borderRadius: '6px' });
  });
});
