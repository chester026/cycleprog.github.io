import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider } from './Toast';
import { useToast } from './useToast';

function Buttons() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Saved!')}>Success</button>
      <button onClick={() => toast.error('Failed')}>Error</button>
      <button onClick={() => toast.info('FYI')}>Info</button>
    </div>
  );
}

describe('Toast / ToastProvider / useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast with role="status" and auto-dismisses it', () => {
    render(
      <ToastProvider>
        <Buttons />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Success' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved!');

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('error toasts use a longer default duration', () => {
    render(
      <ToastProvider>
        <Buttons />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    expect(screen.getByText('Failed')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.getByText('Failed')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it('can be dismissed manually before the timer fires', () => {
    render(
      <ToastProvider>
        <Buttons />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('FYI')).not.toBeInTheDocument();
  });

  it('useToast throws without a provider', () => {
    const Bare = () => {
      useToast();
      return null;
    };
    expect(() => render(<Bare />)).toThrow(/ToastProvider/);
  });
});
