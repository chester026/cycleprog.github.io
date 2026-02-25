import React, {createContext, useContext, useEffect, useRef} from 'react';
import {View, Image, Animated, StyleSheet, Easing} from 'react-native';

const letterB = require('../assets/img/splash/b.png');
const letterL = require('../assets/img/splash/l.png');

const LETTER_HEIGHT = 100;

const LETTERS = [
  {src: letterB, key: 'B', ratio: 1014 / 1014},
  {src: letterL, key: 'L', ratio: 857 / 1014},
];

const PULSE_DURATION = 1500;

const AnimatedLetter: React.FC<{source: any; ratio: number}> = ({
  source,
  ratio,
}) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.03,
          duration: PULSE_DURATION / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_DURATION / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulse]);

  const scale = Animated.add(1, pulse);

  return (
    <Animated.View style={{transform: [{scale}]}}>
      <Image
        source={source}
        style={{height: LETTER_HEIGHT, width: LETTER_HEIGHT * ratio}}
        resizeMode="contain"
      />
    </Animated.View>
  );
};

export const SplashLoader: React.FC = () => (
  <View style={styles.container}>
    <View style={styles.row}>
      {LETTERS.map(l => (
        <AnimatedLetter key={l.key} source={l.src} ratio={l.ratio} />
      ))}
    </View>
  </View>
);

// Context for GarageScreen to signal "ready" to App
type SplashContextType = {hideSplash: () => void};
const SplashContext = createContext<SplashContextType>({hideSplash: () => {}});
export const SplashProvider = SplashContext.Provider;
export const useHideSplash = () => useContext(SplashContext).hideSplash;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#274dd3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
});
