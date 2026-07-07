import React from 'react';
import Svg, {Path} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

// Decorative "AI" marker for the coach home prompt input — a plain SVG
// four-point sparkle rather than a Unicode/emoji glyph, so it renders
// identically (a flat single-color shape) on every device instead of
// picking up a platform emoji font.
export const SparkleIcon: React.FC<IconProps> = ({size = 16, color = '#fff'}) => (
  <Svg width={size} height={size} viewBox="0 -960 960 960" fill={color}>
    <Path d="M480-120 405-315 210-390l195-75 75-195 75 195 195 75-195 75-75 195Z" />
  </Svg>
);
