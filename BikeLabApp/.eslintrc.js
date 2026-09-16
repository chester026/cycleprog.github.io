module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'react/jsx-no-leaked-render': ['warn', {validStrategies: ['ternary', 'coerce']}],
  },
};
