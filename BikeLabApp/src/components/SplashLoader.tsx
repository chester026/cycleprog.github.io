import React, {createContext, useContext, useEffect, useRef} from 'react';
import {View, Image, Animated, StyleSheet, Easing} from 'react-native';
import Svg, {Path} from 'react-native-svg';

const rideWLogo = require('../assets/img/shareTemplates/logos/ride_w.png');

const PULSE_DURATION = 1500;
const LOGO_HEIGHT = 120;
const LOGO_WIDTH = LOGO_HEIGHT * (69 / 140);

const BLLogo: React.FC = () => (
  <Svg width={LOGO_WIDTH} height={LOGO_HEIGHT} viewBox="0 0 69 140" fill="none">
    <Path
      d="M68.8643 112.707V139.407H51.4287C49.772 139.407 48.4289 138.064 48.4287 136.407V135.613C48.4287 130.971 48.8984 127.178 49.8379 124.232C52.321 116.549 57.0363 112.707 63.9824 112.707H68.8643ZM68.7637 78.6123V104.448H0.140625V78.6123H68.7637ZM40.9492 0C49.5477 6.57058e-05 56.1191 2.05162 60.6631 6.15332C64.8224 9.88817 66.9023 14.74 66.9023 20.709C66.9023 26.6449 64.3158 30.9474 59.1426 33.6152H58.9854C65.6614 36.2497 69 40.9686 69 47.7715C68.9999 54.0073 66.7097 58.9094 62.1309 62.4775C57.3422 66.2124 50.5436 68.0801 41.7354 68.0801H36.9111V0H40.9492ZM28.208 67.9795H0V0H28.208V67.9795Z"
      fill="white"
    />
  </Svg>
);

export const SplashLoader: React.FC = () => {
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
    <View style={styles.container}>
      <Animated.View style={{transform: [{scale}]}}>
        <BLLogo />
      </Animated.View>
      <Image source={rideWLogo} style={styles.bottomLogo} resizeMode="contain" />
    </View>
  );
};

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
  bottomLogo: {
    position: 'absolute',
    bottom: 52,
    height: 30,
    opacity: 1,
  },
});
