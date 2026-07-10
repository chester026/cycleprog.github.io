import React from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Stop} from 'react-native-svg';

// Score ring shared by RideScoreCard (effort) and RecoveryCard (recovery) —
// replaces the old flat "colored dot + big number" layout with the gradient
// progress ring from the "Rich Chat Cards v2" style reference. `gradientId`
// must be unique among rings mounted at once (SVG <defs> ids aren't scoped
// per-component), so callers pass something like "effortRing"/"recoveryRing".
export const ProgressRing: React.FC<{
  size?: number;
  strokeWidth?: number;
  value: number; // 0-100
  colors: [string, string];
  gradientId: string;
  trackColor?: string;
  children?: React.ReactNode;
}> = ({size = 82, strokeWidth = 6, value, colors, gradientId, trackColor = '#EDEFF1', children}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const dashOffset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <View style={{width: size, height: size}}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={colors[0]} />
            <Stop offset="100%" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
