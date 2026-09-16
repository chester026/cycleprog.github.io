// T-1.7 (docs/audit/00-AUDIT-AND-PLAN.md): a minimal vitest setup for pure
// utility functions only — no DOM/component tests here yet. `environment:
// 'node'` (rather than the jsdom default) keeps this fast and makes sure a
// test can't accidentally depend on browser globals (window/localStorage)
// that a pure util shouldn't need. `include` is scoped to `src/**/__tests__`
// so vitest never has to walk node_modules looking for test files.
export default {
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.js'],
  },
};
