// A-23: eslint-plugin-i18next is loaded conditionally so `npx eslint src`
// still runs in a checkout where devDependencies aren't installed yet.
let hasI18nextPlugin = false;
try {
  require.resolve('eslint-plugin-i18next');
  hasI18nextPlugin = true;
} catch {
  hasI18nextPlugin = false;
}

module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'react/jsx-no-leaked-render': ['warn', {validStrategies: ['ternary', 'coerce']}],
  },
  overrides: [
    {
      // T-5.4 (audit A-27): flag hardcoded hex colors outside the theme
      // module so new/edited code migrates to `src/theme` tokens instead
      // of adding another one-off literal. Warning, not error, so it
      // doesn't block the rest of the migration mid-flight.
      files: ['src/**/*.{js,jsx,ts,tsx}'],
      excludedFiles: ['src/theme/**/*'],
      rules: {
        'no-restricted-syntax': [
          'warn',
          {
            selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
            message:
              'Hardcoded hex color — use a token from src/theme (see src/theme/colors.ts) instead.',
          },
        ],
      },
    },
    // A-23: no literal user-facing strings in JSX — every screen/component
    // string goes through `t('...')` (both en.json/ru.json, GUIDE-5.md).
    // `error`, not `warn`, per A-23's remediation plan: this is a new rule
    // for new/edited code, not a repo-wide backfill in one pass — the
    // exclusions below cover the non-translatable cases (testIDs, a11y
    // roles, style values, unit tokens, punctuation, bare numbers).
    ...(hasI18nextPlugin
      ? [
          {
            files: ['src/**/*.tsx'],
            // T-5.6 (audit A-23 backfill): test files render synthetic
            // fixture strings (mock component text, testID-only markers)
            // that aren't real app UI — the rule's job is production JSX.
            excludedFiles: ['src/**/*.test.tsx', 'src/**/__tests__/**'],
            plugins: ['i18next'],
            rules: {
              'i18next/no-literal-string': [
                'error',
                {
                  mode: 'jsx-text-only',
                  'jsx-attributes': {
                    include: ['placeholder', 'title', 'accessibilityLabel', 'accessibilityHint'],
                    exclude: [
                      'testID',
                      'accessibilityRole',
                      'style',
                      'className',
                      'source',
                      'name',
                      'key',
                      'id',
                      'contentContainerStyle',
                    ],
                  },
                  words: {
                    exclude: [
                      // unit tokens / punctuation that don't need translation
                      'km', 'kmh', 'km/h', 'W', 'bpm', 'rpm', 'ms', 'kg', 'h', 'min',
                      // T-5.6: bare distance/jargon unit tokens, identical in
                      // both locales — not language, so not run through t().
                      'm', 'avg', 'efr',
                      // (entries are regexes — escape metacharacters)
                      '%', '—', '·', '×', '›', '‹', '\\+', '/',
                      // T-5.6: decorative icon glyphs used as standalone JSX
                      // text (close/checkmark/bullet/arrow/help buttons,
                      // emoji dividers) — non-linguistic, identical in both
                      // locales, so excluded rather than routed through
                      // t() with a throwaway key. Real words stay excluded
                      // from this list and go through t() instead.
                      '✕', '✓', '•', '⚠️', '⛰', '⏱', '💡', '→', '←', '▼', '▶',
                      '📦', '😕', '🚴‍♂️', '＋', '🕐', '🗑', '#',
                      // "x2"-style multiplier notation and the lone "i"
                      // info-icon glyph (not the word "I") — same in both
                      // locales.
                      'x', 'i',
                      // bare numbers / numeric-ish strings (ids, percentages,
                      // approx./range/dash markers, etc.)
                      "^[-0-9.,:%°+/×‹›≈~–?\\s]*$",
                    ],
                  },
                },
              ],
            },
          },
        ]
      : []),
  ],
};
