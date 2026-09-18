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
  ],
};
