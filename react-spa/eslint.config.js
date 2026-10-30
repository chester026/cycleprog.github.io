import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx,cjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      // `__BUILD_HASH__` is a compile-time constant from vite.config.js `define`.
      globals: { ...globals.browser, __BUILD_HASH__: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // CLAUDE.md rule 8: production builds strip `console.*` (vite `drop`), so
  // a bare console call is lost in prod — web code reports through
  // `logError` in src/lib/log.js, the one file allowed to print. Tests may
  // stub/inspect console freely.
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/lib/log.js', 'src/**/*.test.{js,jsx}', 'src/test/**'],
    rules: { 'no-console': 'error' },
  },
  // T-6.5 (W-42): jsx-a11y recommended rules are errors (CLAUDE.md rule 8).
  // A hard import on purpose: a missing plugin must fail lint, not silently
  // drop every a11y rule.
  { ...jsxA11y.flatConfigs.recommended, files: ['**/*.{js,jsx}'] },
  // T-6.5 (audit W-38..W-41): Playwright config/tests/setup run under
  // plain Node (CommonJS `require`/`module.exports`), not the browser —
  // globals only, no rule changes, so `npm run lint` doesn't flag every
  // `require`/`process`/`__dirname` in these as no-undef.
  {
    files: ['playwright.config.cjs', 'e2e/**/*.cjs'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },
  // vite.config.js stays an ES module (`import`/`export default`) — only
  // add the Node globals it (and this one `process.env.VITE_API_PROXY`
  // line) needs, same reasoning as above.
  {
    files: ['vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
