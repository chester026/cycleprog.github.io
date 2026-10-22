import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';
import { logError } from './log';

// `vi.mock` is hoisted, so the mocks reach into `vi.hoisted` state instead
// of closing over top-level variables.
const state = vi.hoisted(() => ({ enabled: false }));
vi.mock('@sentry/react', () => ({ captureException: vi.fn(), init: vi.fn() }));
vi.mock('./sentry', () => ({
  get sentryEnabled() {
    return state.enabled;
  },
}));

describe('logError', () => {
  beforeEach(() => {
    Sentry.captureException.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not reach Sentry when no DSN is configured', () => {
    state.enabled = false;
    logError(new Error('boom'), 'Error saving goal');
    expect(Sentry.captureException).not.toHaveBeenCalled();
    // vitest runs with DEV=true, so the dev mirror still prints.
    expect(console.error).toHaveBeenCalledWith('Error saving goal', expect.any(Error), '');
  });

  it('captures an Error with the label and extras when enabled', () => {
    state.enabled = true;
    const err = new Error('boom');
    logError(err, 'Error deleting goal', { goalId: 7 });
    expect(Sentry.captureException).toHaveBeenCalledWith(err, { extra: { label: 'Error deleting goal', goalId: 7 } });
  });

  it('wraps non-Error values so Sentry gets a stack', () => {
    state.enabled = true;
    logError('plain string', 'Strava exchange failed');
    const [captured] = Sentry.captureException.mock.calls[0];
    expect(captured).toBeInstanceOf(Error);
    expect(captured.message).toBe('plain string');
  });
});
