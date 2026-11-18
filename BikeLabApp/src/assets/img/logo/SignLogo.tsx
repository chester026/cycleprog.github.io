// BikeLab's sign-in mark: the blue tile with the white letters, for the
// login screen. Drawn from ./signlogo.svg, which is the design source — keep
// the two in step. The source's drop shadow is left out: at 5 % opacity it
// does not show over the login photo, and react-native-svg does not render
// that filter chain.
import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';
import {useTheme} from '../../../theme';

// The tile's own box inside the source's 64×88 canvas; the rest of that
// canvas is room for the shadow.
const TILE = {x: 25.2998, y: 10, width: 29, height: 48};

export const SignLogo: React.FC<{height?: number}> = ({height = 92}) => {
  const theme = useTheme();
  return (
    <Svg
      width={(height * TILE.width) / TILE.height}
      height={height}
      viewBox={`${TILE.x} ${TILE.y} ${TILE.width} ${TILE.height}`}
      fill="none">
      <Rect x={TILE.x} y={TILE.y} width={TILE.width} height={TILE.height} fill={theme.colors.accent} />
      <Path
        d="M45.5005 25.5894C47.0548 26.2323 47.832 27.3838 47.832 29.0439C47.832 30.5658 47.299 31.762 46.2329 32.6328C45.118 33.5443 43.5352 34 41.4844 34H40.3613L40.3613 17.3862L41.3013 17.3862C43.3032 17.3862 44.8332 17.8867 45.8911 18.8877C46.8595 19.7992 47.3437 20.9832 47.3437 22.4399C47.3437 23.8885 46.7415 24.9383 45.5371 25.5894H45.5005ZM31.7676 17.3862L38.335 17.3862L38.335 33.9756L31.7676 33.9756L31.7676 17.3862Z"
        fill={theme.colors.text.inverse}
      />
      <Path
        d="M31.8506 36.5703L31.8506 42.875L47.7764 42.875L47.7764 36.5703L31.8506 36.5703ZM46.6631 44.8906C45.0459 44.8906 43.9482 45.8281 43.3701 47.7031C43.1514 48.4219 43.042 49.3477 43.042 50.4805L43.042 51.4063L47.7998 51.4063L47.7998 44.8906L46.6631 44.8906Z"
        fill={theme.colors.text.inverse}
      />
    </Svg>
  );
};
