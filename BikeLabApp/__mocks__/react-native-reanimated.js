/**
 * A-29: minimal jest mock of `react-native-reanimated`.
 *
 * The real package pulls in `react-native-worklets`' native turbo module at
 * import time (for the UI-thread runtime), which doesn't exist under jest —
 * see the "Native part of Worklets doesn't seem to be initialized" error the
 * library throws otherwise. Reanimated's own `mock.js` still transitively
 * requires the real `./index` (and therefore the native module), so it
 * doesn't help here either. This mock implements, synchronously on the JS
 * thread, only the small surface BlobOrb (and any future consumer) needs:
 * shared values, `useAnimatedStyle`, `withTiming`/`withRepeat` (both resolve
 * immediately — no animation timing in tests) and `Easing`.
 */
const React = require('react');
const {Easing} = require('react-native');

function useSharedValue(initial) {
  const ref = React.useRef({value: initial});
  return ref.current;
}

function useAnimatedStyle(factory) {
  return factory();
}

// Animation modifiers resolve to their target value immediately — tests
// only assert that the component mounts/renders, not the animation curve.
function withTiming(toValue) {
  return toValue;
}

function withRepeat(animation) {
  return animation;
}

function withSpring(toValue) {
  return toValue;
}

const Animated = {
  createAnimatedComponent: (Component) => Component,
  View: require('react-native').View,
  Text: require('react-native').Text,
  Image: require('react-native').Image,
  ScrollView: require('react-native').ScrollView,
};

module.exports = {
  __esModule: true,
  default: Animated,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSpring,
};
