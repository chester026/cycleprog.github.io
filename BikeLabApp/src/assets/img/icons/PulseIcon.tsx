import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {useTheme} from '../../../theme';

interface IconProps {
  size?: number;
  color?: string;
}

// Simple ECG/activity waveform line — used as the "plan" indicator on
// AnalysisScreen's header (Feather "activity" shape).
export const PulseIcon: React.FC<IconProps> = ({size = 18, color}) => {
  const theme = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? theme.colors.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Svg>
  );
};
