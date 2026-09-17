// Server lint: the point is `no-undef` — a reference to a helper that moved
// to another module (ReferenceError → 500 at runtime) must fail CI, not
// production. Style rules are intentionally not enforced here (yet).
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      'no-useless-escape': 'off',
      'no-prototype-builtins': 'off',
      'no-case-declarations': 'warn',
      'no-async-promise-executor': 'warn',
      'preserve-caught-error': 'off',
      'no-useless-assignment': 'warn',
    },
  },
  {
    files: ['test/**/*.js', 'vitest.config.js'],
    languageOptions: { globals: { ...globals.node, describe: 'readonly', it: 'readonly', expect: 'readonly', beforeAll: 'readonly', afterAll: 'readonly', beforeEach: 'readonly', afterEach: 'readonly', vi: 'readonly', test: 'readonly' } },
  },
];
