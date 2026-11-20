import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {useTheme} from '../../../theme';

interface IconProps {
  size?: number;
  color?: string;
}

// Chevron pointing left (Feather "chevron-left" style) — "back" in the coach
// chat's round header button.
export const ChevronLeftIcon: React.FC<IconProps> = ({size = 18, color}) => {
  const theme = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? theme.colors.icon.dark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 18l-6-6 6-6" />
    </Svg>
  );
};
