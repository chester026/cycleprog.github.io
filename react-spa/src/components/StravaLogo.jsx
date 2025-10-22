import React from 'react';
import stravaLogoSvg from '../assets/img/logo/api_logo_pwrdBy_strava_stack_white.svg';
import PartnersLogo from './PartnersLogo';

export default function StravaLogo({ className = '', style = {} }) {
  return (
    <PartnersLogo
      logoSrc={stravaLogoSvg}
      alt="Powered by Strava"
      className={className}
      style={style}
      height="24.5px"
      opacity={1}
      hoverOpacity={1}
    />
  );
}
