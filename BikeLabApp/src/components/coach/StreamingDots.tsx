import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';

// Small three-dot "thinking" indicator shown while the coach's response is
// still empty (no tokens have arrived yet).
export const StreamingDots: React.FC = () => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDot = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {toValue: 1, duration: 300, useNativeDriver: true}),
          Animated.timing(value, {toValue: 0.3, duration: 300, useNativeDriver: true}),
        ]),
      );

    const animations = [animateDot(dot1, 0), animateDot(dot2, 150), animateDot(dot3, 300)];
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.dot, {opacity: dot1}]} />
      <Animated.View style={[styles.dot, {opacity: dot2}]} />
      <Animated.View style={[styles.dot, {opacity: dot3}]} />
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#999',
    marginRight: 4,
  },
});
