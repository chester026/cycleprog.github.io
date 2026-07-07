import React from 'react';
import Svg, {Path} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

// Material Symbols "calendar_month" glyph, same viewBox/fill convention as
// the other tab icons (DirectionsBikeIcon, AltitudeIcon, etc.) so it sits
// consistently in the tab bar.
export const CalendarIcon: React.FC<IconProps> = ({size = 24, color = '#e3e3e3'}) => (
  <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
    <Path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm280 200q-17 0-28.5-11.5T440-480q0-17 11.5-28.5T480-520q17 0 28.5 11.5T520-480q0 17-11.5 28.5T480-440Zm-160 0q-17 0-28.5-11.5T280-480q0-17 11.5-28.5T320-520q17 0 28.5 11.5T360-480q0 17-11.5 28.5T320-440Zm320 0q-17 0-28.5-11.5T600-480q0-17 11.5-28.5T640-520q17 0 28.5 11.5T680-480q0 17-11.5 28.5T640-440ZM320-280q-17 0-28.5-11.5T280-320q0-17 11.5-28.5T320-360q17 0 28.5 11.5T360-320q0 17-11.5 28.5T320-280Zm160 0q-17 0-28.5-11.5T440-320q0-17 11.5-28.5T480-360q17 0 28.5 11.5T520-320q0 17-11.5 28.5T480-280Zm160 0q-17 0-28.5-11.5T600-320q0-17 11.5-28.5T640-360q17 0 28.5 11.5T680-320q0 17-11.5 28.5T640-280Z" />
  </Svg>
);
