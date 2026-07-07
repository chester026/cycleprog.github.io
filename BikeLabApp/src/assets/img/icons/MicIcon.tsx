import React from 'react';
import Svg, {Path} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

export const MicIcon: React.FC<IconProps> = ({size = 20, color = '#666'}) => (
  <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
    <Path d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm-40 320v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-280q83 0 141.5-58.5T680-480h80q0 105-68 184t-172 93v123h-80Z" />
  </Svg>
);
