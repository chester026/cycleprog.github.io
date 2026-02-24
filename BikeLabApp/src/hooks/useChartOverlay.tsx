import React, {useRef, useState, useCallback} from 'react';
import {View} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

export function useChartOverlay() {
  const hapticRef = useRef<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const dismissedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const clear = useCallback(() => {
    dismissedRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    activeRef.current = null;
    hapticRef.current = null;
    setActiveIndex(null);
  }, []);

  const onTouchStart = useCallback(() => {
    dismissedRef.current = false;
  }, []);

  const renderPointerLabel = useCallback((items: any) => {
    if (!items || items.length === 0 || dismissedRef.current) {
      return <View />;
    }
    const item = items[0];

    if (hapticRef.current !== item.index) {
      ReactNativeHapticFeedback.trigger('impactLight', {
        enableVibrateFallback: true,
      });
      hapticRef.current = item.index;
    }

    if (activeRef.current !== item.index) {
      activeRef.current = item.index;
      setTimeout(() => setActiveIndex(item.index), 0);
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      dismissedRef.current = true;
      activeRef.current = null;
      hapticRef.current = null;
      setActiveIndex(null);
    }, 800);

    return <View />;
  }, []);

  const getPointerConfig = useCallback(
    (color: string, stripHeight = 180) => ({
      pointerStripHeight: stripHeight,
      pointerStripColor: color,
      pointerStripWidth: 2,
      pointerColor: color,
      radius: 6,
      pointerLabelWidth: 0,
      pointerLabelHeight: 0,
      activatePointersOnLongPress: false,
      autoAdjustPointerLabelPosition: false,
      pointerLabelComponent: renderPointerLabel,
    }),
    [renderPointerLabel],
  );

  return {
    activeIndex,
    isInteracting: activeIndex !== null,
    renderPointerLabel,
    onTouchStart,
    clear,
    getPointerConfig,
  };
}
