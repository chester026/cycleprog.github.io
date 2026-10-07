/**
 * useScreenshotListener - opens Share Studio when the user takes a system
 * screenshot (Volume + Lock on iPhone).
 *
 * The native listener only exists while the screen that mounts this hook is
 * focused, the app is active and none of our modals is open. Tab screens stay
 * mounted but frozen when blurred, so a state update fired from a screenshot
 * taken on another tab was only applied once Garage was shown again — the
 * studio then popped "on the next tap". Not listening at all while blurred
 * removes that.
 */

import {useEffect, useRef, useState} from 'react';
import {AppState, Platform, NativeModules, NativeEventEmitter} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {logger} from '../../lib/logger';
import {useIsAnyModalOpen} from '../../lib/openModals';

interface UseScreenshotListenerOptions {
  onScreenshot: () => void;
  enabled?: boolean;
}

const SCREENSHOT_DEBOUNCE_MS = 2000;

const useIsAppActive = (): boolean => {
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setIsActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  return isActive;
};

export const useScreenshotListener = ({onScreenshot, enabled = true}: UseScreenshotListenerOptions) => {
  const isFocused = useIsFocused();
  const isAppActive = useIsAppActive();
  const isAnyModalOpen = useIsAnyModalOpen();
  const shouldListen = enabled && isFocused && isAppActive && !isAnyModalOpen;

  // Latest callback in a ref: the native subscription must not be torn down
  // and recreated every time the caller's closure changes (each gap is a
  // window in which a screenshot is missed).
  const onScreenshotRef = useRef(onScreenshot);
  onScreenshotRef.current = onScreenshot;
  const lastScreenshotTime = useRef<number>(0);

  useEffect(() => {
    const {ScreenshotDetect} = NativeModules;
    if (!shouldListen || !ScreenshotDetect) return undefined;

    const subscription = new NativeEventEmitter(ScreenshotDetect).addListener('onScreenshot', () => {
      const now = Date.now();
      if (now - lastScreenshotTime.current < SCREENSHOT_DEBOUNCE_MS) return;
      lastScreenshotTime.current = now;
      logger.debug('Screenshot detected, opening Share Studio');
      onScreenshotRef.current();
    });
    if (Platform.OS === 'ios') ScreenshotDetect.startListening?.();

    return () => {
      subscription.remove();
      if (Platform.OS === 'ios') ScreenshotDetect.stopListening?.();
    };
  }, [shouldListen]);
};

export default useScreenshotListener;
