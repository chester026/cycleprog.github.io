/**
 * useScreenshotListener - Hook to detect system screenshots
 * When user takes a screenshot (Volume + Lock on iPhone), 
 * this hook triggers a callback to open Share Studio
 */

import {useEffect, useRef, useCallback} from 'react';
import {Platform, NativeModules, NativeEventEmitter} from 'react-native';

interface UseScreenshotListenerOptions {
  onScreenshot: () => void;
  enabled?: boolean;
}

const {ScreenshotDetect} = NativeModules;

export const useScreenshotListener = ({
  onScreenshot,
  enabled = true,
}: UseScreenshotListenerOptions) => {
  const lastScreenshotTime = useRef<number>(0);
  
  const handleScreenshot = useCallback(() => {
    // Debounce - prevent multiple triggers
    const now = Date.now();
    if (now - lastScreenshotTime.current < 2000) {
      return;
    }
    lastScreenshotTime.current = now;
    
    console.log('📸 Screenshot detected! Opening Share Studio...');
    onScreenshot();
  }, [onScreenshot]);

  useEffect(() => {
    if (!enabled) {
      console.log('📸 Screenshot listener disabled');
      return;
    }

    if (!ScreenshotDetect) {
      console.log('📸 ScreenshotDetect native module not available');
      return;
    }

    console.log('📸 Setting up screenshot listener...');
    
    // Create event emitter for this module
    const screenshotEmitter = new NativeEventEmitter(ScreenshotDetect);
    
    // Subscribe to screenshot events
    const subscription = screenshotEmitter.addListener(
      'onScreenshot',
      handleScreenshot
    );
    
    // Start listening on iOS
    if (Platform.OS === 'ios') {
      console.log('📸 Starting iOS screenshot listener');
      ScreenshotDetect.startListening();
    }

    return () => {
      console.log('📸 Cleaning up screenshot listener');
      subscription.remove();
      
      if (Platform.OS === 'ios' && ScreenshotDetect?.stopListening) {
        ScreenshotDetect.stopListening();
      }
    };
  }, [enabled, handleScreenshot]);
};

export default useScreenshotListener;
