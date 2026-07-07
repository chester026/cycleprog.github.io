import React from 'react';
import Svg, {Path, Line, Polyline} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

// Plain stroke-based trash can (Feather "trash-2" style) — same reasoning
// as EditIcon: replaces the "🗑" emoji glyph, which rendered as a colored
// platform emoji instead of a flat line icon.
export const TrashIcon: React.FC<IconProps> = ({size = 18, color = '#333'}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="3 6 5 6 21 6" />
    <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <Line x1="10" y1="11" x2="10" y2="17" />
    <Line x1="14" y1="11" x2="14" y2="17" />
  </Svg>
);
