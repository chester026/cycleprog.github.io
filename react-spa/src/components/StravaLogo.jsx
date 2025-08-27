import React from 'react';
import stravaLogoSvg from '../assets/img/logo/api_logo_pwrdBy_strava_stack_white.svg';

export default function StravaLogo({ className = '', style = {} }) {
  return (
    <div 
      className={` ${className}`}
      style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        opacity: 0.5,
        transition: 'opacity 0.3s ease',
        zIndex: 10,
        ...style
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '0.5';
      }}
    >
      <img 
        src={stravaLogoSvg} 
        alt="Powered by Strava" 
        style={{
          height: '30px',
          width: 'auto',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
        }}
      />
    </div>
  );
}
