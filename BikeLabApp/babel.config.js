module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Reanimated 4 split worklet transformation out into its own package —
  // 'react-native-reanimated/plugin' is replaced by 'react-native-worklets/plugin'
  // (not both), same rule applies: MUST be listed last since it rewrites
  // worklets (useDerivedValue in BlobOrb.tsx) at build time and needs to run
  // after every other transform has already touched the code.
  plugins: ['react-native-worklets/plugin'],
};
