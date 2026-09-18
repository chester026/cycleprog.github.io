import React, { useState } from 'react';
import PartnersLogo from '../../components/PartnersLogo';
import BlobOrb from '../../components/BlobOrb';
import AiGoalGenerator from './AiGoalGenerator';
import garminLogoSvg from '../../assets/img/logo/garmin_tag_black.png';
import stravaBlackSvg from '../../assets/img/logo/api_logo_pwrdBy_strava_stack_black.svg';

/**
 * GoalAssistantPage's hero banner (T-6.3 part 2): partner logos, the blob
 * orb + "Generating…" state, and the greeting — wraps `AiGoalGenerator`,
 * which reports its own `generating` state back up here so the blob/heading
 * can react to it (that visual belongs to this shell, not the input row).
 */
export default function GoalsHero({ userName, activities }) {
  const [generating, setGenerating] = useState(false);

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

      <div className={`hero-blob ${generating ? 'generating' : ''}`}>
        <BlobOrb size={850} />
      </div>

      {generating && (
        <div className="generating-text">
          Generating<span className="dots"></span>
        </div>
      )}

      <div className={`hero-content ${generating ? 'hidden' : ''}`}>
        <h1 className="hero-heading">
          Hey <span className="hero-username">{userName}</span> what should we work on today?
        </h1>
        <p className="hero-subtitle">Ask me anything about cycling — training, gear, recovery, nutrition, or your own rides.</p>

        <AiGoalGenerator onGeneratingChange={setGenerating} />
      </div>
    </div>
  );
}
