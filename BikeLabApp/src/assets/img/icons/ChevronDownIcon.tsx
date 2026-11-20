import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {useTheme} from '../../../theme';

interface IconProps {
  size?: number;
  color?: string;
}

// Small chevron pointing down — beside a title that opens a menu when tapped
// (the coach chat's title).
export const ChevronDownIcon: React.FC<IconProps> = ({size = 12, color}) => {
  const theme = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? theme.colors.icon.dark} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9l6 6 6-6" />
    </Svg>
  );
};
