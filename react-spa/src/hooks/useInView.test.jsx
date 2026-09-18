import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useInView } from './useInView';

// Mocked IntersectionObserver (jsdom doesn't implement it): captures the
// callback passed by the hook so tests can fire an intersection entry by
// hand, and records observe/unobserve/disconnect calls.
let observedCallback = null;
let observeSpy;
let unobserveSpy;
let disconnectSpy;

function installMockIntersectionObserver() {
  observeSpy = vi.fn();
  unobserveSpy = vi.fn();
  disconnectSpy = vi.fn();
  class MockIntersectionObserver {
    constructor(callback) {
      observedCallback = callback;
    }
    observe(el) {
      observeSpy(el);
    }
    unobserve(el) {
      unobserveSpy(el);
    }
    disconnect() {
      disconnectSpy();
    }
  }
  globalThis.IntersectionObserver = MockIntersectionObserver;
}

function Probe({ once }) {
  const [ref, inView] = useInView({ once });
  return <div ref={ref} data-testid="target">{inView ? 'visible' : 'hidden'}</div>;
}

describe('useInView', () => {
  beforeEach(() => {
    installMockIntersectionObserver();
  });

  afterEach(() => {
    delete globalThis.IntersectionObserver;
    observedCallback = null;
  });

  it('starts out of view', () => {
    render(<Probe once />);
    expect(screen.getByTestId('target')).toHaveTextContent('hidden');
    expect(observeSpy).toHaveBeenCalledTimes(1);
  });

  it('flips to in-view once the observed element intersects', () => {
    render(<Probe once />);
    act(() => observedCallback([{ isIntersecting: true }]));
    expect(screen.getByTestId('target')).toHaveTextContent('visible');
  });

  it('stops observing after the first intersection when once=true (default)', () => {
    render(<Probe once />);
    act(() => observedCallback([{ isIntersecting: true }]));
    expect(unobserveSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps tracking visibility when once=false', () => {
    render(<Probe once={false} />);
    act(() => observedCallback([{ isIntersecting: true }]));
    expect(screen.getByTestId('target')).toHaveTextContent('visible');
    act(() => observedCallback([{ isIntersecting: false }]));
    expect(screen.getByTestId('target')).toHaveTextContent('hidden');
    expect(unobserveSpy).not.toHaveBeenCalled();
  });

  it('falls back to inView=true when IntersectionObserver is unavailable', () => {
    delete globalThis.IntersectionObserver;
    render(<Probe once />);
    expect(screen.getByTestId('target')).toHaveTextContent('visible');
  });
});
