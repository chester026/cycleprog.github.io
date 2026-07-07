module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // react-native-reanimated's plugin MUST be listed last — it rewrites
  // worklets (useDerivedValue/useClock in BlobOrp.tsx) at build time and
  // needs to run after every other transform has already touched the code.
  plugins: ['react-native-reanimated/plugin'],
};
