import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {useTheme} from '../../../theme';

interface IconProps {
  size?: number;
  color?: string;
}

export const HomeIcon: React.FC<IconProps> = ({size = 24, color}) => {
  const theme = useTheme();
  return (
  <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color ?? theme.colors.icon.default}>
    <Path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z" />
  </Svg>
  );
};

