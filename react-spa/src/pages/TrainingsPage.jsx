import React, { useState } from 'react';
import './TrainingsPage.css';
import { useActivities, useAnalyticsSummary } from '../data/hooks';
import Footer from '../components/Footer';
import PartnersLogo from '../components/PartnersLogo';
import BlobOrb from '../components/BlobOrb';
import { ErrorMessage } from '../ui';
import garminLogoSvg from '../assets/img/logo/garmin_tag_black.png';
import stravaBlackSvg from '../assets/img/logo/api_logo_pwrdBy_strava_stack_black.svg';
import { ActivityFilters } from './trainings/ActivityFilters';
import { ActivityList } from './trainings/ActivityList';
import { DEFAULT_FILTERS, useActivityView } from './trainings/lib';
import RideAnalysisModal from './ride/RideAnalysisModal';

export default function TrainingsPage() {
  // T-6.2 (audit W-18): the page's own `activities_${userId}` localStorage
  // cache + jwtDecode-derived userId is gone — activities now come from the
  // shared TanStack Query cache, invalidated together everywhere instead
  // of leaving this page's copy stale.
  const { data: activitiesData, isLoading: loading, error: activitiesError } = useActivities();
  const activities = activitiesData || [];
  const [selectedYear, setSelectedYear] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  // The ride open in the analysis modal; null = closed.
  const [analyzedActivity, setAnalyzedActivity] = useState(null);

  // T-6.3 (audit W-26): filtering/sorting/grouping moved to
  // `./trainings/lib.js` (a single `useMemo`) so this component only wires
  // state to the filter form and the table.
  const { years, types, groupedYears } = useActivityView(activities, selectedYear, filters);

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const handleYearChange = (e) => {
    setSelectedYear(e.target.value);
  };

  // T-6.2: the year-filtered analytics summary comes from the shared query
  // cache (useAnalyticsSummary) instead of a fetch-on-selectedYear-change
  // effect. A user with no linked Strava simply gets an empty
  // `/api/activities` response from the server — no client-side
  // cache-busting needed for that case now that there's no per-user
  // localStorage key to bust.
  // T-6.3 (audit W-26): dropped the unused `useHeroImages`/`startStravaLogin`
  // wiring left over from an earlier version of this page — `heroImage` was
  // computed but never rendered, and no button called `handleStravaLogin`.
  const { data: analyticsData } = useAnalyticsSummary({ year: selectedYear });
  const analytics = analyticsData?.summary;

  return (
    <div className="trainings-page">
      <div id="trainings-hero-banner" className="plan-hero hero-banner">
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
          <h1 className="hero-heading">Every <b>ride</b> you've logged, in one place</h1>
          <div className="plan-meta-row">
            <p className="hero-subtitle">
              Browse, filter and export all your synced rides <br/>through the years.&nbsp;
              <select
                value={selectedYear}
                onChange={handleYearChange}
                className="year-selector"
                aria-label="Select year"
              >
                <option value="all">All Years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </p>
          </div>

          <div className="plan-fact-hero">
            <div className="plan-fact-hero-card">
              <div className="card-stats">
                <span className="card-percentage">{analytics?.totalKm ?? 0}</span>
                <span className="card-fraction">km</span>
              </div>
              <div className="card-label">Total Distance</div>
            </div>
            <div className="plan-fact-hero-card">
              <div className="card-stats">
                <span className="card-percentage">{analytics?.totalElev ?? 0}</span>
                <span className="card-fraction">m</span>
              </div>
              <div className="card-label">Elevation Gain</div>
            </div>
            <div className="plan-fact-hero-card">
              <div className="card-stats">
                <span className="card-percentage">{analytics?.totalMovingHours ?? 0}</span>
                <span className="card-fraction">h</span>
              </div>
              <div className="card-label">Moving Time</div>
            </div>
            <div className="plan-fact-hero-card">
              <div className="card-stats">
                <span className="card-percentage">{analytics?.avgSpeed ?? 0}</span>
                <span className="card-fraction">km/h</span>
              </div>
              <div className="card-label">Average Speed</div>
            </div>
          </div>

        </div>
      </div>
      {activitiesError && <ErrorMessage>Error loading Strava data</ErrorMessage>}
      <div className="trainings-content">
        {loading && <div className="content-loader"><div></div></div>}
        <ActivityFilters
          filters={filters}
          onFiltersChange={setFilters}
          types={types}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onReset={resetFilters}
        />
        <div className="activities-table-container">
          {!loading && !activitiesError && (
            <ActivityList groupedYears={groupedYears} onAnalyze={setAnalyzedActivity} />
          )}
        </div>
      </div>

      <RideAnalysisModal
        open={analyzedActivity != null}
        onClose={() => setAnalyzedActivity(null)}
        activity={analyzedActivity}
      />

      <Footer />
    </div>
  );
}
