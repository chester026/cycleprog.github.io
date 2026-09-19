// A-30: the package isn't installed in this worktree, so every path here
// exercises the no-op behaviour (DSN unset, and package missing even if a
// DSN were set) — that's the behaviour these tests lock in. Once
// `@sentry/react-native` is installed and a DSN configured, `initSentry`
// starts actually calling into it; that integration isn't testable here.
jest.mock('../config', () => ({SENTRY_DSN: ''}));

import {initSentry, isSentryEnabled, wrapRootComponent, captureException} from './sentry';

describe('sentry (no-op path, SENTRY_DSN unset)', () => {
  it('isSentryEnabled is false without a DSN', () => {
    expect(isSentryEnabled()).toBe(false);
  });

  it('initSentry does not throw and does nothing observable', () => {
    expect(() => initSentry()).not.toThrow();
  });

  it('wrapRootComponent returns the component unchanged', () => {
    const Root = () => null;
    expect(wrapRootComponent(Root)).toBe(Root);
  });

  it('captureException does not throw', () => {
    expect(() => captureException(new Error('boom'))).not.toThrow();
  });
});

describe('sentry (DSN set, package not installed)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../config', () => ({SENTRY_DSN: 'https://example@sentry.io/1'}));
  });

  afterEach(() => {
    jest.dontMock('../config');
  });

  it('still no-ops when @sentry/react-native cannot be required', () => {
    const sentry = require('./sentry');
    expect(sentry.isSentryEnabled()).toBe(false);
    expect(() => sentry.initSentry()).not.toThrow();
    const Root = () => null;
    expect(sentry.wrapRootComponent(Root)).toBe(Root);
  });
});
