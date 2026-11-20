import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {useTheme} from '../../../theme';

interface IconProps {
  size?: number;
  color?: string;
}

// Arrow pointing down (Feather "arrow-down" style) — "jump to the latest
// message" in the coach chat.
export const ArrowDownIcon: React.FC<IconProps> = ({size = 16, color}) => {
  const theme = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? theme.colors.icon.dark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 5v14" />
      <Path d="M19 12l-7 7-7-7" />
    </Svg>
  );
};
