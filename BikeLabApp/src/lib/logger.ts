/* eslint-disable no-console */

// debug/info are dev-only noise and no-op in production builds.
// warn/error stay live in production too, so real issues are still visible
// (e.g. via a crash reporter's console breadcrumbs).
const noop = (..._args: any[]) => {};

export const logger = {
  debug: __DEV__ ? console.log.bind(console) : noop,
  info: __DEV__ ? console.log.bind(console) : noop,
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export default logger;
