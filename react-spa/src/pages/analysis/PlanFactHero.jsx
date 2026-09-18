// T-6.3: the top hero banner, split out of AnalysisPage.jsx. Always
// above-the-fold (visible immediately, no chart in it), so unlike
// PeriodSummary/SkillsSection/MetricSection it is NOT behind useInView.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PartnersLogo from '../../components/PartnersLogo';
import BlobOrb from '../../components/BlobOrb';
import garminLogoSvg from '../../assets/img/logo/garmin_tag_black.png';
import stravaBlackSvg from '../../assets/img/logo/api_logo_pwrdBy_strava_stack_black.svg';
import { getPlanFromProfile } from '@bikelab/shared/calc';
import { computePlanFactHero, formatPeriodDate, isEmptyPeriod } from './lib';

export function PlanFactHero({ activities, userProfile, lastRealIntervals }) {
  const navigate = useNavigate();

  const planFactHero = useMemo(
    () => computePlanFactHero(activities, getPlanFromProfile(userProfile), lastRealIntervals),
    [activities, userProfile, lastRealIntervals]
  );

  const period = planFactHero.minDate && planFactHero.maxDate ? {
    start: planFactHero.minDate,
    end: planFactHero.maxDate
  } : null;

  const heroSummary = useMemo(() => {
    if (!planFactHero.data) return null;

    const plan = getPlanFromProfile(userProfile);
    return {
      totalRides: planFactHero.data[0]?.fact || 0,
      totalKm: planFactHero.data[1]?.fact || 0,
      longRidesCount: planFactHero.data[2]?.fact || 0,
      progress: {
        rides: planFactHero.data[0]?.pct || 0,
        km: planFactHero.data[1]?.pct || 0,
        long: planFactHero.data[2]?.pct || 0
      },
      plan: {
        rides: planFactHero.data[0]?.plan || 12,
        km: planFactHero.data[1]?.plan || 400,
        long: planFactHero.data[2]?.plan || 4,
        description: plan?.description || 'Training plan',
        experienceLevel: plan?.experienceLevel,
        timeAvailable: plan?.timeAvailable
      }
    };
  }, [planFactHero.data, userProfile]);

  return (
    <div id="plan-hero-banner" className="plan-hero hero-banner">
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

      <div className="hero-blob">
        <BlobOrb size={850} />
      </div>

      <div className="hero-content">
        <h1 className="hero-heading">Here's how your <b>training's</b> been going</h1>
        {heroSummary?.plan && (
          <div className="plan-meta-row">

            <p className="hero-subtitle">Current 4w period:
              &nbsp;
              {period && period.start && period.end && (
                <span className="period-info">
                  <b>{formatPeriodDate(period.start)}</b> — <b>{formatPeriodDate(period.end)}</b>
                </span>
              )}
              .&nbsp;
              Your plan is&nbsp;
              <strong>{heroSummary.plan.description}</strong>
              {heroSummary.plan.experienceLevel && heroSummary.plan.timeAvailable && (
                <span className="plan-details">
                  ({heroSummary.plan.timeAvailable}h/week · {Math.round(heroSummary.plan.rides / 4)} rides/week)
                </span>
              )}
              .&nbsp;It's easy to
              <button
                onClick={() => navigate('/profile?tab=training')}
                className="change-plan-btn"
              >
                change a plan
              </button>
              .
            </p>

          </div>
        )}

        {heroSummary && (
          <>
            {isEmptyPeriod(heroSummary) ? (
              <div className="empty-period-message">
                <h3>No Data. Rides are waiting for you!</h3>
                <b>Start doing rides to commit progress for current period</b>
              </div>
            ) : (
              <div className="plan-fact-hero">
                <div className="plan-fact-hero-card">
                  <div className="card-stats">
                    <span className="card-percentage">{heroSummary.progress.rides}%</span>
                    <span className="card-fraction">{heroSummary.totalRides} / {heroSummary.plan?.rides || 12}</span>
                  </div>
                  <div className="card-label">Workouts</div>
                </div>
                <div className="plan-fact-hero-card">
                  <div className="card-stats">
                    <span className="card-percentage">{heroSummary.progress.km}%</span>
                    <span className="card-fraction">{heroSummary.totalKm} / {heroSummary.plan?.km || 400}</span>
                  </div>
                  <div className="card-label">Volume, km</div>
                </div>
                <div className="plan-fact-hero-card">
                  <div className="card-stats">
                    <span className="card-percentage">{heroSummary.progress.long}%</span>
                    <span className="card-fraction">{heroSummary.longRidesCount} / {heroSummary.plan?.long || 4}</span>
                  </div>
                  <div className="card-label">Long rides</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
