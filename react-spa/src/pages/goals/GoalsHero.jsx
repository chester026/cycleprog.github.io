import React from 'react';
import PartnersLogo from '../../components/PartnersLogo';
import BlobOrb from '../../components/BlobOrb';
import garminLogoSvg from '../../assets/img/logo/garmin_tag_black.png';
import stravaBlackSvg from '../../assets/img/logo/api_logo_pwrdBy_strava_stack_black.svg';
import './GoalsHero.css';

/**
 * The coach home's hero banner: partner logos, the blob orb and the
 * "Hey {name} what should we work on today?" headline. Whatever sits under
 * the headline (the prompt input and quick-start chips) comes in as
 * `children`, so this shell owns only the chrome.
 */
export default function GoalsHero({ userName, subtitle, activities, children }) {
  return (
    <div id="goal-hero-banner" className="plan-hero hero-banner">
      <PartnersLogo
        logoSrc={garminLogoSvg}
        alt="Powered by Garmin"
        height="32px"
        position="absolute"
        top="16px"
        right="auto"
        style={{ right: '8px' }}
        opacity={1}
        hoverOpacity={1}
        filterEffect="none"
        activities={activities}
        showOnlyForBrands={['Garmin']}
      />
      <PartnersLogo
        logoSrc={stravaBlackSvg}
        alt="Powered by Strava"
        height="24.5px"
        opacity={1}
        hoverOpacity={1}
        filterEffect="none"
      />

      <div className="hero-blob" aria-hidden="true">
        <BlobOrb size={850} />
      </div>

      <div className="hero-content">
        <h1 className="hero-heading">
          Hey <span className="hero-username">{userName}</span> what should we work on today?
        </h1>
        {subtitle ? <p className="hero-subtitle">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}
