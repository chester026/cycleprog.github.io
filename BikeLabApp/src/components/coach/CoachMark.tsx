import React, {useEffect, useRef} from 'react';
import {Animated, Easing} from 'react-native';
import Svg, {Circle, Defs, RadialGradient, Stop} from 'react-native-svg';
import {useTheme} from '../../theme';

const TURN_MS = 5000;
const BREATH_MS = 900;
const BREATH_SCALE = 1.14;
const SETTLE_MS = 250;

// The coach's mark beside a reply: BlobOrb's look — a milky sphere with
// blue, violet and a touch of pink living in its core — as one small
// picture that is ALWAYS the same element. While the reply is being made
// (`live`) it turns slowly and breathes; when the reply is done it comes to
// rest. It used to be swapped for the real BlobOrb during the work — a
// larger, different-looking orb appearing and vanishing in the same spot
// (owner, 20.11.2026); and BlobOrb is a Skia canvas on a running clock,
// which a transcript should not mount once per message.
export const CoachMark: React.FC<{size?: number; live?: boolean}> = ({size = 24, live = false}) => {
  const {orb} = useTheme().colors.coach;
  const turn = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!live) return undefined;
    const turning = Animated.loop(
      Animated.timing(turn, {toValue: 1, duration: TURN_MS, easing: Easing.linear, useNativeDriver: true}),
    );
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {toValue: 1, duration: BREATH_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
        Animated.timing(breath, {toValue: 0, duration: BREATH_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
      ]),
    );
    turning.start();
    breathing.start();
    return () => {
      turning.stop();
      breathing.stop();
      // Back to its resting size; the turn stays where it stopped — the
      // mark has no "up", so there is nothing to snap back to.
      Animated.timing(breath, {toValue: 0, duration: SETTLE_MS, useNativeDriver: true}).start();
    };
  }, [live, turn, breath]);

  const transform = [
    {rotate: turn.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']})},
    {scale: breath.interpolate({inputRange: [0, 1], outputRange: [1, BREATH_SCALE]})},
  ];

  return (
    <Animated.View style={{width: size, height: size, transform}} testID={live ? 'coach-mark-live' : 'coach-mark'}>
      <CoachMarkPicture size={size} orb={orb} />
    </Animated.View>
  );
};

interface OrbColors {
  base: string;
  blue: string;
  violet: string;
  pink: string;
  glint: string;
}

// Memoised: the picture never changes while the wrapper animates.
const CoachMarkPicture = React.memo(function Picture({size, orb}: {size: number; orb: OrbColors}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <RadialGradient id="coachMarkBase" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={orb.base} stopOpacity={1} />
          <Stop offset="0.72" stopColor={orb.base} stopOpacity={1} />
          <Stop offset="1" stopColor={orb.base} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="coachMarkBlue" cx="40%" cy="46%" r="52%">
          <Stop offset="0" stopColor={orb.blue} stopOpacity={0.9} />
          <Stop offset="1" stopColor={orb.blue} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="coachMarkViolet" cx="64%" cy="60%" r="50%">
          <Stop offset="0" stopColor={orb.violet} stopOpacity={0.8} />
          <Stop offset="1" stopColor={orb.violet} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="coachMarkPink" cx="62%" cy="34%" r="40%">
          <Stop offset="0" stopColor={orb.pink} stopOpacity={0.4} />
          <Stop offset="1" stopColor={orb.pink} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="coachMarkGlint" cx="34%" cy="30%" r="30%">
          <Stop offset="0" stopColor={orb.glint} stopOpacity={0.55} />
          <Stop offset="1" stopColor={orb.glint} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={12} cy={12} r={12} fill="url(#coachMarkBase)" />
      <Circle cx={12} cy={12} r={10} fill="url(#coachMarkPink)" />
      <Circle cx={12} cy={12} r={10} fill="url(#coachMarkViolet)" />
      <Circle cx={12} cy={12} r={10} fill="url(#coachMarkBlue)" />
      <Circle cx={12} cy={12} r={10} fill="url(#coachMarkGlint)" />
    </Svg>
  );
});
