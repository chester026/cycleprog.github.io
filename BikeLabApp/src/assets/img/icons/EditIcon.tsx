import React from 'react';
import Svg, {Path} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

// Plain stroke-based pencil (Feather "edit-2" style) — the emoji glyph "✎"
// it replaced rendered as a garish colored Apple emoji instead of a flat
// line icon, which looked completely out of place next to the rest of the
// app's SVG icons.
export const EditIcon: React.FC<IconProps> = ({size = 18, color = '#333'}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
  </Svg>
);
