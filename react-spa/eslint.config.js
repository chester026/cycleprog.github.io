import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
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
      globals: globals.browser,
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
